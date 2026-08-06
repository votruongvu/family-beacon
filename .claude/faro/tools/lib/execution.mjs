/**
 * The execution boundary of an approved route.
 *
 * Faro's canonical model ends at an approved Route Contract. Implementation is
 * ordinary Claude Code work guided by that contract, so this module exists to
 * answer four questions and nothing more:
 *
 *   Is this route valid, approved, and still bound to what it was derived from?
 *   Which paths have changed in the registered repositories?
 *   Are all changed paths inside `write_scope`?
 *   Did any protected or excluded path change?
 *
 * It is read-only in both directions. Nothing here writes to a repository, writes
 * to `.faro/`, runs a project script, or records a result. There is no session, no
 * workspace, no change set, no evidence record, and no verification run — adding
 * any of them would make Faro own an execution lifecycle it deliberately does not.
 *
 * The one external command is `git`, reached through the existing read-only
 * `working_tree_status` probe rather than through new process handling here.
 */
import { FaroError } from './errors.mjs';
import { requiredRouteApproval, validateRoute } from './model.mjs';
import { resolveRepository } from './repositories.mjs';
import { runProbe } from './probes.mjs';
import { routingFreshness } from './routing.mjs';
import { committedPaths, resolveBase, workingTreePaths } from './gitflow.mjs';
import { readItem, exists } from './store.mjs';

/**
 * Which route fact or verification obligation demands a challenge no implementer
 * and no ordinary verifier is authorised to perform. Derived from the facts and
 * the obligation kinds, never from prose — the same rule approval policy follows.
 */
export const SPECIALIST_CHALLENGES = {
  irreversible_data_change: 'data integrity — the route implicates stored state that cannot be recovered if it is written wrongly',
  external_credentials_required: 'credential boundary — the route requires external credentials or a provider sandbox',
  architecture_boundary_changed: 'architecture boundary — the route is suspected to move a boundary between components',
  protected_scope_at_risk: 'protected contract — the plausible wrong implementation lands on a surface the route protects',
};

/** Verification kinds that name their own specialist authority. */
export const CHALLENGE_VERIFICATION_KINDS = {
  security_challenge: 'security — the route carries a security obligation',
  migration: 'migration — the route carries a migration obligation against stored state',
};

/* ------------------------------------------------------------- workability */

/**
 * Resolve one route and refuse it unless work may actually begin from it.
 *
 * Every refusal is a fact about the route, not a judgement about the work: the
 * status it holds, the approval policy computed from its own facts, whether its
 * bindings still match, and whether it authorises changing anything at all.
 *
 * `requireFresh` is the one option, and it exists for a reason: the Verifier has
 * to be able to report on a tree where a protected file was touched. Refusing it
 * with "the route is stale" would hide the finding behind the symptom.
 *
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 * @param {{ requireFresh?: boolean }} [options]
 */
export function readWorkableRoute(store, id, options = {}) {
  if (!/^ROUTE-\d{4}$/.test(id ?? '')) {
    throw new FaroError('INVALID_ID', `"${id}" is not a route id.`, { hint: 'Route ids look like ROUTE-0001.' });
  }
  const relative = `routes/${id}.md`;
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

  const data = route.data;
  // Schema validity is not coherence. A route whose facts contradict its own
  // scopes cannot be the authority for anything, whatever status it holds.
  const contradictions = validateRoute(data, readInvestigation(store, data.investigation), {
    baselineStatus: (id) => (exists(store, `baselines/${id}.md`) ? readItem(store, `baselines/${id}.md`, 'baseline').data.status : undefined),
  });
  if (contradictions.length > 0) {
    throw new FaroError('ROUTE_INVALID', `${id} contradicts its own contract.`, {
      hint: contradictions.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      path: `.faro/${relative}`,
    });
  }

  if (data.status !== 'approved') {
    throw new FaroError('ROUTE_NOT_APPROVED', `${id} is ${data.status} and cannot be worked from.`, {
      hint: refusalHint(data),
      path: `.faro/${relative}`,
    });
  }

  const computed = requiredRouteApproval(data);
  if (computed.level === 'human' && data.approval?.required !== 'human') {
    throw new FaroError('ROUTE_APPROVAL_UNDERSTATED', `${id} records approval "${data.approval?.required}" but its own facts require a named human.`, {
      hint: `${computed.reasons.join('; ')}. The route cannot be used as written — correct it and have a human approve it.`,
      path: `.faro/${relative}`,
    });
  }
  if (data.approval?.required === 'human' && data.approval?.granted !== true) {
    throw new FaroError('ROUTE_APPROVAL_PENDING', `${id} is waiting for a named human before it can be used.`, {
      hint: `Run: faro route-approve ${id} --by "Their Name". Claude never grants it.`,
      path: `.faro/${relative}`,
    });
  }

  if (data.rebase && data.rebase.reconsidered !== true) {
    throw new FaroError('ROUTE_NOT_RECONSIDERED', `${id} was rebased from ${data.rebase.routed_from} and has not been reconsidered.`, {
      hint: 'Run /faro-route-rebase to re-run the affected probes, then set rebase.reconsidered: true.',
      path: `.faro/${relative}`,
    });
  }

  const freshness = workingFreshness(store, data);
  if (options.requireFresh !== false && freshness.moved.length > 0) {
    throw new FaroError('ROUTE_STALE', `${id} is bound to project or repository state that has changed outside its write scope.`, {
      hint: `${freshness.moved.map((entry) => entry.message).join('; ')}. Run \`/faro-route-rebase ${id}\` and reconsider it before working from it.`,
      path: `.faro/${relative}`,
    });
  }

  if ((data.scope?.write_scope ?? []).length === 0) {
    throw new FaroError('ROUTE_NO_WRITE_SCOPE', `${id} authorises no write scope, so there is nothing it permits changing.`, {
      hint: 'A route that could not locate the work cannot authorise changing it. Resolve the ambiguity through /faro-route-rebase, or route the item again.',
      path: `.faro/${relative}`,
    });
  }

  return { id, data, body: route.body, freshness };
}

/** The investigation behind a route, when it is readable. Null is a valid answer. */
function readInvestigation(store, id) {
  const relative = `investigations/${id}.md`;
  if (!id || !exists(store, relative)) return null;
  const investigation = readItem(store, relative, 'investigation');
  return investigation.issues.length > 0 ? null : investigation.data;
}

/**
 * Freshness as it applies to *working from* a route, which is not the same
 * question as freshness for approving one.
 *
 * A route binds to the repository files it rests on so that it expires when the
 * code moves. But implementing a route necessarily changes files in its own write
 * scope — so a binding inside the write scope that no longer matches is the work
 * happening, not the ground moving. Treating the two the same would make a route
 * expire the moment it was used, and would refuse the Verifier the diff it exists
 * to review.
 *
 * A write-scope binding that moved is still reported, and the boundary still
 * refuses to call the tree clear: `/faro-work` requires the user to confirm that
 * pre-existing changes belong to this work.
 *
 * @param {import('./store.mjs').Store} store
 * @param {Record<string, any>} route
 * @returns {{ fresh: boolean, moved: {message: string}[], expected: {message: string}[], changed: string[] }}
 */
function workingFreshness(store, route) {
  const freshness = routingFreshness(store, route);
  const moved = [];
  const expected = [];
  for (const entry of freshness.entries) {
    const inWriteScope =
      entry.kind === 'repository' &&
      entry.repository !== undefined &&
      entry.path !== undefined &&
      classifyPath(route, entry.repository, entry.path).verdict === 'write';
    (inWriteScope ? expected : moved).push(entry);
  }
  return { fresh: freshness.fresh, moved, expected, changed: freshness.changed };
}

function refusalHint(data) {
  if (data.status === 'draft') return 'A draft route has not been reviewed. Finish /faro-route, then have it approved.';
  if (data.status === 'review_required') return `Approval is pending. Run: faro route-approve ${data.id} --by "Their Name".`;
  if (data.status === 'rejected') return `It was rejected: ${data.rejection_reason ?? 'no reason recorded'}. Route the item again if the work is still wanted.`;
  if (data.status === 'superseded') return `It was replaced by ${data.superseded_by ?? 'a successor'}. Work from the successor instead.`;
  return 'Only an approved route may be worked from.';
}

/**
 * Challenges this route requires from an authority the Implementer and the
 * Verifier do not hold. Pure function of the route's own facts and obligations.
 * @param {Record<string, any>} route
 * @returns {{ trigger: string, challenge: string, evidence: string[] }[]}
 */
function pendingChallenges(route) {
  const pending = [];
  const facts = route?.route_facts ?? {};
  for (const [name, challenge] of Object.entries(SPECIALIST_CHALLENGES)) {
    if (facts[name]?.value === true) pending.push({ trigger: name, challenge, evidence: facts[name].evidence ?? [] });
  }
  for (const [kind, challenge] of Object.entries(CHALLENGE_VERIFICATION_KINDS)) {
    const obligations = (route?.verification ?? []).filter((item) => item.kind === kind);
    if (obligations.length > 0) pending.push({ trigger: `verification.${kind}`, challenge, evidence: obligations.map((item) => item.id) });
  }
  return pending;
}

/* ------------------------------------------------------------ path scoping */

/**
 * Where one repository path stands against a route's four scopes.
 *
 * One rule decides it: **a path is forbidden when any protected or excluded entry
 * covers it, however specific the write entry that also covers it is.** Write
 * scope grants only what nothing else forbids. So a broad `write:
 * services/ingestion/src` cannot authorise editing the identity contract the same
 * route protects — and neither can a write entry naming that contract outright.
 * A route that contradicts itself that way stops the work and asks for an
 * amendment, which is the safe direction to be wrong in.
 *
 * Among the entries that forbid, the most specific one is reported, because the
 * reason a path is out of bounds is what the implementer has to act on.
 *
 * @param {Record<string, any>} route
 * @param {string} repository
 * @param {string} relative POSIX-style path relative to the repository root
 * @returns {{ repository: string, path: string, verdict: 'write'|'protected'|'excluded'|'read'|'unrouted', entry: Record<string, any>|null }}
 */
export function classifyPath(route, repository, relative) {
  const candidate = normalizePath(relative);
  const scope = route?.scope ?? {};
  const covering = (entries) =>
    (entries ?? []).filter((item) => item.repository === repository && contains(item.path, candidate));

  const forbidding = [
    ...covering(scope.excluded_scope).map((entry) => ({ verdict: 'excluded', entry })),
    ...covering(scope.protected_scope).map((entry) => ({ verdict: 'protected', entry })),
  ];
  if (forbidding.length > 0) {
    // Longest path wins; an exact tie goes to `excluded`, which forbids reading too.
    const best = forbidding.sort(
      (a, b) => normalizePath(b.entry.path).length - normalizePath(a.entry.path).length
        || (a.verdict === 'excluded' ? -1 : 1),
    )[0];
    return { repository, path: candidate, verdict: best.verdict, entry: best.entry };
  }
  for (const [verdict, entries] of [['write', scope.write_scope], ['read', scope.read_scope]]) {
    const entry = covering(entries)[0];
    if (entry) return { repository, path: candidate, verdict, entry };
  }
  return { repository, path: candidate, verdict: 'unrouted', entry: null };
}

/** A scope entry covers a path when it is that path or a directory above it. */
function contains(entryPath, candidate) {
  const scoped = normalizePath(entryPath);
  if (scoped === '' || scoped === '.') return true;
  return candidate === scoped || candidate.startsWith(`${scoped}/`);
}

/**
 * Reject anything that is not a plain path inside a repository root, before it is
 * ever compared to a scope. Purely lexical — a path is refused for its shape, not
 * for what happens to exist on disk.
 * @param {string} relative
 */
function normalizePath(relative) {
  const value = String(relative ?? '').split('\\').join('/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (value.startsWith('/') || /^[a-zA-Z]:\//.test(value)) {
    throw new FaroError('PATH_ABSOLUTE', `"${relative}" must be relative to a repository root.`, {
      hint: 'Scope entries and changed paths are always relative to the registered repository root.',
    });
  }
  if (value.split('/').includes('..')) {
    throw new FaroError('PATH_ESCAPE', `"${relative}" resolves outside its repository root.`, {
      hint: 'Faro only reasons about paths inside a registered repository.',
      path: relative,
    });
  }
  return value;
}

/* --------------------------------------------------------- changed paths */

/**
 * Every path this work changed, committed or not, repository-relative.
 *
 * Committing is part of the workflow, so a check that read only the working tree
 * would report a branch with three commits as "clean" — the exact shape of a
 * false pass. The effective set is therefore the union of what the branch
 * committed since its base and what is still uncommitted.
 *
 * Repositories the route marks `excluded` are not consulted — a route that
 * declares a repository out of scope should not have its status read either.
 *
 * @param {import('./store.mjs').Store} store
 * @param {Record<string, any>} route
 * @param {{ base?: string|null, includeCommitted?: boolean }} [options]
 */
function changedPaths(store, route, options = {}) {
  const { base = null, includeCommitted = true } = options;
  const repositories = [];
  /** @type {Map<string, {repository: string, path: string, states: Set<string>}>} */
  const merged = new Map();
  const record = (repository, relative, state) => {
    const key = `${repository}:${relative}`;
    if (!merged.has(key)) merged.set(key, { repository, path: relative, states: new Set() });
    merged.get(key).states.add(state);
  };

  // A repository any scope entry names is inspected regardless of the role the
  // route gave it. Skipping on role alone let a route mark its own write
  // repository `excluded` and every read of the tree then came back empty —
  // which reads exactly like a clean result.
  const scoped = new Set(
    ['read_scope', 'write_scope', 'protected_scope', 'excluded_scope']
      .flatMap((name) => route.scope?.[name] ?? [])
      .map((item) => item.repository),
  );
  for (const entry of route.repositories ?? []) {
    if (entry.role === 'excluded' && !scoped.has(entry.id)) continue;
    let repository;
    try {
      repository = resolveRepository(store, entry.id);
    } catch (err) {
      repositories.push({ repository: entry.id, role: entry.role, branch: null, clean: null, changed_count: null, base: null, limitations: [], errors: [err.message] });
      continue;
    }

    const summary = { repository: entry.id, role: entry.role, root: repository.root, branch: null, clean: null, changed_count: null, base: null, limitations: [], errors: [] };
    const probe = runProbe(repository, { type: 'working_tree_status' });
    summary.branch = probe.detail?.branch ?? null;
    summary.clean = probe.detail?.clean ?? null;
    summary.changed_count = probe.detail?.changed_count ?? null;
    summary.limitations = probe.limitations ?? [];
    summary.errors = probe.errors ?? [];

    if (summary.clean === null) {
      // Not a git working tree. Say so; never report an unreadable tree as clean.
      repositories.push(summary);
      continue;
    }

    for (const item of workingTreePaths(repository.absolute)) {
      if (item.untracked) record(entry.id, item.path, 'untracked');
      if (item.staged) record(entry.id, item.path, 'staged');
      if (item.unstaged && !item.untracked) record(entry.id, item.path, 'unstaged');
    }

    if (includeCommitted) {
      // Refusing here is deliberate: an unresolvable base means the committed
      // range would be a guess, and a guessed range reads as a clean result.
      const resolved = resolveBase(repository.absolute, base);
      summary.base = {
        ref: resolved.ref,
        commit: resolved.commit.slice(0, 7),
        inferred: resolved.inferred,
        degenerate: resolved.degenerate ?? null,
      };
      if (resolved.degenerate) {
        summary.limitations = [
          ...summary.limitations,
          `you are on ${resolved.degenerate}, so there is no branch range yet and the committed range is empty by construction — anything committed directly to ${resolved.degenerate} is outside it, so pass --base to inspect those`,
        ];
      }
      const { paths: committed, outside } = committedPaths(repository.absolute, resolved.commit);
      for (const item of committed) record(entry.id, item.path, 'committed');
      if (outside > 0) {
        // Silent truncation is a defect everywhere else in Faro; it is one here too.
        summary.limitations = [...summary.limitations, `${outside} committed path(s) lie outside the registered root and were not classified`];
      }
    }
    repositories.push(summary);
  }

  const order = ['committed', 'staged', 'unstaged', 'untracked'];
  const changed = [...merged.values()]
    .map((entry) => {
      const states = order.filter((state) => entry.states.has(state));
      return { repository: entry.repository, path: entry.path, states, state: states.join('+') || '?' };
    })
    .sort((a, b) => a.repository.localeCompare(b.repository) || a.path.localeCompare(b.path));

  return { repositories, changed };
}

/**
 * Classify a set of paths against a route. With no explicit targets this reads
 * the working tree; with targets it answers "may this path be changed?" before
 * anything is edited.
 *
 * @param {import('./store.mjs').Store} store
 * @param {Record<string, any>} route
 * @param {{repository: string, path: string, state?: string}[]} [targets]
 * @param {{ freshness?: {moved: {message: string}[]}, base?: string|null, includeCommitted?: boolean }} [options]
 */
export function scopeCheck(store, route, targets, options = {}) {
  const source = targets ?? null;
  const { repositories, changed } = source === null
    ? changedPaths(store, route, { base: options.base ?? null, includeCommitted: options.includeCommitted !== false })
    : { repositories: [], changed: source };
  const checked = changed.map((entry) => ({
    ...classifyPath(route, entry.repository, entry.path),
    state: entry.state ?? null,
    states: entry.states ?? [],
  }));

  const of = (verdict) => checked.filter((entry) => entry.verdict === verdict);
  const result = {
    mode: source === null ? (options.includeCommitted === false ? 'working_tree' : 'branch') : 'paths',
    base: repositories.find((entry) => entry.base)?.base ?? null,
    repositories,
    checked,
    within_write: of('write'),
    protected_violations: of('protected'),
    excluded_violations: of('excluded'),
    outside_scope: [...of('read'), ...of('unrouted')],
    limitations: repositories.flatMap((entry) => entry.limitations.map((line) => `${entry.repository}: ${line}`)),
    errors: repositories.flatMap((entry) => entry.errors.map((line) => `${entry.repository}: ${line}`)),
    // Something the route rests on moved outside its write scope. Separate from a
    // scope violation, because the cause is different and so is the remedy.
    moved_bindings: (options.freshness ?? workingFreshness(store, route)).moved.map((entry) => entry.message),
  };
  result.ok = result.protected_violations.length === 0 && result.excluded_violations.length === 0 && result.outside_scope.length === 0;
  return result;
}

/* ------------------------------------------------------------- pre-flight */

/**
 * The full boundary of one approved route, plus what the working tree already
 * does to it. This is what must be read before any implementation starts.
 *
 * The verdict is deliberately conservative: uncommitted work already inside the
 * write scope is not a failure, but it is not something Faro may wave through
 * either — only the user can say those changes belong to this work.
 *
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 */
export function executionBoundary(store, id, options = {}) {
  const route = readWorkableRoute(store, id);
  // Before work starts there are no commits, so the boundary tolerates an
  // unresolvable base rather than refusing to describe the route at all.
  let check;
  try {
    check = scopeCheck(store, route.data, undefined, { freshness: route.freshness, ...options });
  } catch (err) {
    if (err.code !== 'AMBIGUOUS_BASE' && err.code !== 'NO_COMMITS') throw err;
    check = scopeCheck(store, route.data, undefined, { freshness: route.freshness, includeCommitted: false });
    check.limitations = [...check.limitations, `committed work was not inspected: ${err.hint ?? err.message}`];
    check.committedInspected = false;
  }

  const violations = [...check.protected_violations, ...check.excluded_violations];
  // `clear` is a strong word. It is only earned when everything was actually
  // looked at — a boundary that could not read the committed range says so
  // instead, because an unlooked-at range reads exactly like a clean one.
  const committedInspected = check.committedInspected !== false;
  const verdict = violations.length > 0
    ? 'scope_violation'
    : check.within_write.length > 0
      ? 'overlap_requires_confirmation'
      : committedInspected
        ? 'clear'
        : 'base_unresolved';

  return {
    route: {
      id: route.id,
      signature: route.data.signature,
      investigation: route.data.investigation,
      status: route.data.status,
      confidence: route.data.routing_confidence,
      isolation: route.data.execution_boundary?.recommended_isolation ?? null,
      required_environment: route.data.execution_boundary?.required_environment ?? null,
      approval_required: route.data.approval?.required ?? 'none',
      approval_granted: route.data.approval?.granted === true,
      approved_by: route.data.approval?.granted_by ?? null,
      source: (route.data.context?.mandatory ?? []).map((entry) => entry.path),
    },
    fresh: route.freshness.fresh,
    changed_bindings: route.freshness.moved.map((entry) => entry.message),
    expected_binding_changes: route.freshness.expected.map((entry) => entry.message),
    repositories: check.repositories,
    base: check.base,
    committed_inspected: committedInspected,
    scope: {
      read: route.data.scope?.read_scope ?? [],
      write: route.data.scope?.write_scope ?? [],
      protected: route.data.scope?.protected_scope ?? [],
      excluded: route.data.scope?.excluded_scope ?? [],
    },
    context: route.data.context ?? { mandatory: [], optional: [], excluded: [] },
    verification: route.data.verification ?? [],
    stop_conditions: route.data.stop_conditions ?? [],
    ambiguities: route.data.ambiguities ?? [],
    pending_challenges: pendingChallenges(route.data),
    changed: check.checked,
    overlapping: check.within_write,
    violations,
    unrelated: check.outside_scope,
    limitations: check.limitations,
    errors: check.errors,
    verdict,
  };
}
