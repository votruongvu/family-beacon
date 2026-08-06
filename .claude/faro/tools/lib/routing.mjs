/**
 * Routing artifacts: signatures, investigations, and route contracts.
 *
 * Routing binds twice. A route records the `.faro/` artifacts it was reasoned
 * from *and* the repository files a probe actually matched, both by content
 * hash. So a route expires when the requirement it compiled changes, or when the
 * code it located moves — and stays valid when anything else does.
 *
 * Nothing here writes to a repository. The only mutation is inside `.faro/`.
 */
import { FaroError } from './errors.mjs';
import { ordered } from './model.mjs';
import { now, hashText, readUtf8 } from './fs-safe.mjs';
import { resolveRepository, resolveInRepository } from './repositories.mjs';
import { repositoryFileHash, runProbe } from './probes.mjs';
import { beginTransaction, finalizeStaging, commitTransaction, abortTransaction } from './transaction.mjs';
import {
  storePath,
  exists,
  readItem,
  writeItem,
  nextId,
  advanceStoreRevision,
} from './store.mjs';

/* ---------------------------------------------------------------- sources */

/**
 * Resolve `REQ-0004@1`, `REQ-0004`, or `OBL-0001` to an exact immutable source.
 *
 * A signature may only be compiled from something already admitted: a
 * requirement version that exists on disk, or an obligation still awaiting
 * routing. Draft intake has not been agreed to, and routing it would give
 * unadmitted reasoning the authority of an approved boundary.
 *
 * @param {import('./store.mjs').Store} store
 * @param {string} reference
 */
export function resolveRoutingSource(store, reference) {
  const requirementRef = /^(REQ-\d{4})(?:@(\d+))?$/.exec(reference ?? '');
  if (requirementRef) {
    const [, id, version] = requirementRef;
    if (!version) {
      throw new FaroError('SOURCE_VERSION_REQUIRED', `Routing needs an exact requirement version, not "${id}".`, {
        hint: `Name the version you mean, for example ${id}@1. A route bound to "latest" would silently change meaning.`,
      });
    }
    const relative = `requirements/${id}/v${version}.md`;
    if (!exists(store, relative)) {
      throw new FaroError('SOURCE_NOT_FOUND', `${reference} does not exist.`, {
        hint: 'Run `/faro-inspect` to see which requirement versions are admitted.',
        path: `.faro/${relative}`,
      });
    }
    const item = readItem(store, relative, 'requirement');
    if (['captured', 'analyzed', 'rejected', 'superseded', 'obsolete', 'deferred'].includes(item.data.status)) {
      throw new FaroError('SOURCE_NOT_ADMITTED', `${reference} is ${item.data.status} and cannot be routed.`, {
        hint: 'Routing compiles admitted work. Admit or revive the requirement first.',
        path: `.faro/${relative}`,
      });
    }
    return {
      type: 'requirement',
      id,
      version: Number.parseInt(version, 10),
      path: relative,
      content_hash: hashText(readUtf8(storePath(store, relative))),
      title: item.data.title,
      data: item.data,
      body: item.body,
    };
  }

  if (/^OBL-\d{4}$/.test(reference ?? '')) {
    const relative = `obligations/${reference}.md`;
    if (!exists(store, relative)) {
      throw new FaroError('SOURCE_NOT_FOUND', `${reference} does not exist.`, {
        hint: 'Run `/faro-inspect` to see accepted obligations.',
        path: `.faro/${relative}`,
      });
    }
    const item = readItem(store, relative, 'obligation');
    if (item.data.status !== 'unrouted') {
      throw new FaroError('SOURCE_NOT_ADMITTED', `${reference} is ${item.data.status} and no longer awaits routing.`, {
        hint: 'A closed obligation is history. Capture a new intake if the work has returned.',
        path: `.faro/${relative}`,
      });
    }
    return {
      type: 'obligation',
      id: reference,
      version: null,
      path: relative,
      content_hash: hashText(readUtf8(storePath(store, relative))),
      title: item.data.title,
      data: item.data,
      body: item.body,
    };
  }

  throw new FaroError('INVALID_SOURCE', `"${reference}" is not a routable source.`, {
    hint: 'Route an exact requirement version (REQ-0004@1) or an accepted obligation (OBL-0001).',
  });
}

/* ---------------------------------------------------------------- probing */

/**
 * Run one probe and append it to an investigation.
 *
 * Claude chooses which probe to run and why; the toolkit executes it and records
 * the normalized result, so probe evidence is never transcribed by hand.
 *
 * @param {import('./store.mjs').Store} store
 * @param {{ investigation: string, repository: string, type: string, query?: string }} request
 */
export function recordProbe(store, request) {
  const relative = `investigations/${request.investigation}.md`;
  if (!exists(store, relative)) {
    throw new FaroError('INVESTIGATION_NOT_FOUND', `${request.investigation} does not exist.`, {
      hint: 'Create the investigation before recording probes into it.',
      path: `.faro/${relative}`,
    });
  }
  const investigation = readItem(store, relative, 'investigation');
  if (investigation.data.status !== 'open') {
    throw new FaroError('INVESTIGATION_CLOSED', `${request.investigation} is closed.`, {
      hint: 'A closed investigation is evidence of how one route was derived; start a new one to probe again.',
    });
  }

  const repository = resolveRepository(store, request.repository);
  const result = runProbe(repository, { type: request.type, query: request.query });
  const probes = investigation.data.probes ?? [];
  const probe = { probe_id: `P-${String(probes.length + 1).padStart(3, '0')}`, ...result };

  writeItem(
    store,
    relative,
    ordered('investigation', { ...investigation.data, probes: [...probes, probe] }),
    investigation.body,
  );
  return probe;
}

/** Run a probe without recording it — for exploration before a hypothesis is fixed. */
export function previewProbe(store, request) {
  const repository = resolveRepository(store, request.repository);
  return { probe_id: 'P-000', ...runProbe(repository, { type: request.type, query: request.query }) };
}

/* -------------------------------------------------------------- freshness */

/**
 * Is a routing artifact still bound to the project and code it was derived from?
 *
 * Two binding kinds, one rule: a route is stale when a source it actually used
 * has changed, and fresh when anything else has.
 *
 * @param {import('./store.mjs').Store} store
 * @param {Record<string, any>} artifact
 */
export function routingFreshness(store, artifact) {
  const entries = [];
  const note = (kind, message, extra = {}) => entries.push({ kind, message, ...extra });

  for (const binding of artifact.context_bindings ?? []) {
    if (!exists(store, binding.path)) {
      note('context', `${binding.path} no longer exists`, { path: binding.path });
      continue;
    }
    if (hashText(readUtf8(storePath(store, binding.path))) !== binding.hash) {
      note('context', `${binding.path} changed since the route was derived`, { path: binding.path });
    }
  }

  for (const binding of artifact.repository_bindings ?? []) {
    let repository;
    try {
      repository = resolveRepository(store, binding.repository);
    } catch (err) {
      // Missing from disk and never registered are different problems with
      // different fixes, so they are never reported as the same sentence.
      note(
        'repository',
        err.code === 'REPOSITORY_MISSING'
          ? `repository ${binding.repository} is registered but missing from disk`
          : `repository ${binding.repository} is no longer registered`,
        { repository: binding.repository, path: binding.path },
      );
      continue;
    }
    const current = repositoryFileHash(repository, binding.path);
    const where = { repository: binding.repository, path: binding.path };
    if (current === null) note('repository', `${binding.repository}:${binding.path} no longer exists`, where);
    else if (current !== binding.hash) note('repository', `${binding.repository}:${binding.path} changed since the route was derived`, where);
  }

  // A signature is bound to the exact source it compiled, which is immutable for
  // a requirement version and mutable for an obligation.
  if (artifact.source?.path) {
    if (!exists(store, artifact.source.path)) note('source', `${artifact.source.path} no longer exists`, { path: artifact.source.path });
    else if (hashText(readUtf8(storePath(store, artifact.source.path))) !== artifact.source.content_hash) {
      note('source', `${artifact.source.path} changed since the signature was compiled`, { path: artifact.source.path });
    }
  }

  return { fresh: entries.length === 0, changed: entries.map((entry) => entry.message), entries };
}

/* -------------------------------------------------------------- bindings */

/**
 * Record the repository files a route relies on, at their current content.
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 * @param {string[]} targets `repository:path` pairs
 */
export function bindRepositoryFiles(store, id, targets) {
  const relative = `routes/${id}.md`;
  if (!exists(store, relative)) {
    throw new FaroError('ROUTE_NOT_FOUND', `${id} does not exist.`, { hint: 'Create the route before binding it.' });
  }
  const route = readItem(store, relative, 'route');
  const bindings = [];
  for (const target of targets) {
    const separator = target.indexOf(':');
    if (separator === -1) {
      throw new FaroError('USAGE', `"${target}" is not a repository binding.`, {
        hint: 'Bindings look like app:services/ingestion/src/worker/dedup.ts',
      });
    }
    const repositoryId = target.slice(0, separator);
    const filePath = target.slice(separator + 1);
    const repository = resolveRepository(store, repositoryId);
    bindings.push({ repository: repositoryId, path: filePath, hash: repositoryFileHash(repository, filePath) });
    resolveInRepository(repository, filePath);
  }
  writeItem(store, relative, ordered('route', { ...route.data, repository_bindings: bindings }), route.body);
  return bindings;
}

/* --------------------------------------------------------------- approval */

/** @param {import('./store.mjs').Store} store @param {string} id @param {string} by */
export function approveRoute(store, id, by) {
  const route = readOpenRoute(store, id);
  if (!by || by.trim() === '') {
    throw new FaroError('APPROVER_REQUIRED', 'Route approval must name the person granting it.', {
      hint: `Run: faro route-approve ${id} --by "Your Name"`,
    });
  }
  const freshness = routingFreshness(store, route.data);
  if (!freshness.fresh) {
    throw new FaroError('ROUTE_STALE', `${id} is bound to project or repository state that has changed.`, {
      hint: `${freshness.changed.join('; ')}. Run \`/faro-route-rebase ${id}\` before approving it.`,
    });
  }
  // A rebased route carries the original's conclusions forward. Approving one
  // before it is reconsidered would grant authority to reasoning nobody re-ran.
  if (route.data.rebase && route.data.rebase.reconsidered !== true) {
    throw new FaroError('ROUTE_NOT_RECONSIDERED', `${id} is a rebase whose scope and confidence have not been reconsidered yet.`, {
      hint: `Run /faro-route-rebase to re-run the affected probes, then set rebase.reconsidered: true.`,
      path: `.faro/routes/${id}.md`,
    });
  }
  writeItem(
    store,
    `routes/${id}.md`,
    ordered('route', {
      ...route.data,
      status: 'approved',
      approval: { required: 'human', granted: true, granted_by: by.trim(), granted_at: now() },
    }),
    route.body,
  );
  return { id, approvedBy: by.trim() };
}

/** @param {import('./store.mjs').Store} store @param {string} id @param {string} reason */
export function rejectRoute(store, id, reason) {
  const route = readOpenRoute(store, id);
  if (!reason || reason.trim() === '') {
    throw new FaroError('REASON_REQUIRED', 'Rejecting a route must record why.', {
      hint: `Run: faro route-reject ${id} --reason "why this route is wrong"`,
    });
  }
  writeItem(
    store,
    `routes/${id}.md`,
    ordered('route', { ...route.data, status: 'rejected', rejected_at: now(), rejection_reason: reason.trim() }),
    route.body,
  );
  return { id, reason: reason.trim() };
}

/* ----------------------------------------------------------------- rebase */

/**
 * Carry a stale route onto current project and repository state.
 *
 * Same shape as proposal rebase, and for the same reason: a stale route can
 * never be forced, but the investigation behind it is expensive and the source
 * item has not changed. The successor starts from the original's conclusions as
 * a *starting point* — `rebase.reconsidered` is false until Claude re-runs the
 * affected probes and reconsiders scope, confidence, isolation, and obligations.
 *
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 */
export function rebaseRoute(store, id) {
  const relative = `routes/${id}.md`;
  if (!exists(store, relative)) {
    throw new FaroError('ROUTE_NOT_FOUND', `${id} does not exist.`, { hint: 'Run `/faro-inspect` to list routes.' });
  }
  const original = readItem(store, relative, 'route');
  if (!['draft', 'review_required', 'approved'].includes(original.data.status)) {
    throw new FaroError('ROUTE_CLOSED', `${id} is ${original.data.status} and cannot be rebased.`, {
      hint: 'Rebase carries an open route forward. A closed one is already history.',
    });
  }
  const freshness = routingFreshness(store, original.data);
  if (freshness.fresh) {
    throw new FaroError('ROUTE_NOT_STALE', `${id} is still bound to current project and repository state.`, {
      hint: `There is nothing to rebase. Use it as it stands, or reject it if the route is wrong.`,
    });
  }

  const successor = nextId(store, 'route');
  const txn = beginTransaction(store, id);
  try {
    const staged = txn.staged;

    const contextBindings = (original.data.context_bindings ?? [])
      .filter((binding) => exists(staged, binding.path))
      .map((binding) => ({ path: binding.path, hash: hashText(readUtf8(storePath(staged, binding.path))) }));
    if (contextBindings.length === 0) {
      throw new FaroError('REBASE_IMPOSSIBLE', `Every project source ${id} was derived from has disappeared.`, {
        hint: 'Compile a fresh signature instead.',
      });
    }

    const repositoryBindings = [];
    const droppedRepositoryBindings = [];
    for (const binding of original.data.repository_bindings ?? []) {
      let hash = null;
      try {
        hash = repositoryFileHash(resolveRepository(staged, binding.repository), binding.path);
      } catch {
        hash = null;
      }
      if (hash === null) droppedRepositoryBindings.push(`${binding.repository}:${binding.path}`);
      else repositoryBindings.push({ ...binding, hash });
    }

    const successorData = ordered('route', {
      ...original.data,
      id: successor,
      status: 'draft',
      created_at: now(),
      // Approval never carries over, and never starts below where it was.
      approval: { required: original.data.approval?.required ?? 'none', granted: false },
      context_bindings: contextBindings,
      repository_bindings: repositoryBindings,
      rebase: {
        routed_from: id,
        rebased_at: now(),
        changed_bindings: freshness.changed,
        previous_confidence: original.data.routing_confidence,
        previous_scope_summary: summariseScope(original.data),
        reconsidered: false,
      },
      superseded_by: undefined,
      rejected_at: undefined,
      rejection_reason: undefined,
    });

    writeItem(staged, `routes/${successor}.md`, successorData, rebaseBody(original, id, freshness.changed, droppedRepositoryBindings));
    writeItem(staged, relative, ordered('route', { ...original.data, status: 'superseded', superseded_by: successor }), original.body);
    advanceStoreRevision(staged, txn.id);

    finalizeStaging(store, txn, id);
    commitTransaction(store, txn);
    return { id, successor, changed: freshness.changed, droppedRepositoryBindings, transaction: txn.id };
  } catch (err) {
    abortTransaction(txn);
    throw err;
  }
}

function summariseScope(route) {
  const count = (list) => (list ?? []).length;
  const scope = route.scope ?? {};
  return `${route.routing_confidence} confidence; read ${count(scope.read_scope)}, write ${count(scope.write_scope)}, protected ${count(scope.protected_scope)}, excluded ${count(scope.excluded_scope)}; isolation ${route.execution_boundary?.recommended_isolation}`;
}

function rebaseBody(original, previousId, changed, dropped) {
  const lines = [
    '## Routing summary',
    '',
    section(original.body, 'Routing summary') || `Carried forward from ${previousId}.`,
    '',
    '## Reasoning',
    '',
    `**Rebased from ${previousId}. The reasoning below is the original's and has not been reconsidered yet.**`,
    '',
    'These bound sources changed:',
    '',
    ...changed.map((entry) => `- ${entry}`),
  ];
  if (dropped.length > 0) {
    lines.push('', 'These repository bindings were dropped because the file no longer exists:', '', ...dropped.map((entry) => `- ${entry}`));
  }
  lines.push(
    '',
    'Re-run the probes those sources fed, then reconsider scope, confidence, isolation, and',
    'verification obligations before setting `rebase.reconsidered: true`. A moved contract can',
    'widen a write scope, invalidate a protected surface, or turn a confident route into one',
    'that has to stop and ask.',
    '',
    '### Original reasoning',
    '',
    section(original.body, 'Reasoning') || '_none recorded_',
  );
  return lines.join('\n');
}

function section(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return '';
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join('\n').trim();
}

function readOpenRoute(store, id) {
  const relative = `routes/${id}.md`;
  if (!/^ROUTE-\d{4}$/.test(id ?? '')) {
    throw new FaroError('INVALID_ID', `"${id}" is not a route id.`, { hint: 'Route ids look like ROUTE-0001.' });
  }
  if (!exists(store, relative)) {
    throw new FaroError('ROUTE_NOT_FOUND', `${id} does not exist.`, { hint: 'Run `/faro-inspect` to list routes.' });
  }
  const route = readItem(store, relative, 'route');
  if (route.issues.length > 0) {
    throw new FaroError('ROUTE_INVALID', `${id} does not satisfy the route schema.`, {
      hint: route.issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      path: `.faro/${relative}`,
    });
  }
  if (!['draft', 'review_required'].includes(route.data.status)) {
    throw new FaroError('ROUTE_CLOSED', `${id} is already ${route.data.status}.`, {
      hint: 'Only a draft or review_required route can be approved or rejected.',
    });
  }
  return route;
}
