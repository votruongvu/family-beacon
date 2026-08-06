/**
 * `faro inspect` / `faro verify` — validate the store and summarise it.
 *
 * One health question, answered three ways:
 *   healthy  every canonical file is valid and every reference resolves
 *   warning  valid, but something needs attention (draft charter, stale view,
 *            pending approval, stale proposal, unrouted obligation)
 *   invalid  a canonical file is missing, malformed, schema-invalid, points at
 *            something that does not exist, or a transaction cannot be resolved
 */
import { FaroError } from './errors.mjs';
import { validate } from './schema.mjs';
import { readUtf8, hashText } from './fs-safe.mjs';
import {
  CHARTER_ID_PATTERNS,
  VERSION_REF,
  UNBINDABLE_PATHS,
  requiredApproval,
  validateSemanticFacts,
  CLASSIFICATION_OPS,
  requiredRouteApproval,
  validateRoute,
} from './model.mjs';
import { allViewStatuses } from './views.mjs';
import { recoverTransactions } from './transaction.mjs';
import { readRepositories } from './repositories.mjs';
import { routingFreshness } from './routing.mjs';
import {
  storePath,
  exists,
  readItem,
  readProject,
  listRequirements,
  listDecisions,
  listKnowledge,
  listBaselines,
  listObligations,
  listIntakeRecords,
  listProposals,
  listSignatures,
  listInvestigations,
  listRoutes,
} from './store.mjs';

/**
 * Store-derived answers the semantic-fact validator needs. Claude asserts the
 * facts; these lookups are how the toolkit checks them against reality.
 * @param {import('./store.mjs').Store} store
 */
export function factLookups(store) {
  const requirements = new Map();
  for (const entry of listRequirements(store)) {
    if (entry.latest === 0) continue;
    const item = tryRead(store, `requirements/${entry.id}/v${entry.latest}.md`, 'requirement');
    if (item) requirements.set(entry.id, item.data.status);
  }
  const baselines = new Map();
  for (const id of listBaselines(store)) {
    const item = tryRead(store, `baselines/${id}.md`, 'baseline');
    if (item) baselines.set(id, item.data.status);
  }
  const obligations = new Map();
  for (const id of listObligations(store)) {
    const item = tryRead(store, `obligations/${id}.md`, 'obligation');
    if (item) obligations.set(id, item.data.status);
  }
  return {
    requirementStatus: (id) => requirements.get(id),
    baselineStatus: (id) => baselines.get(id),
    obligationStatus: (id) => obligations.get(id),
  };
}

/** @param {import('./store.mjs').Store} store */
export function validateStore(store) {
  return buildReport(store);
}

function buildReport(store) {
  /** @type {{severity:'error'|'warning', code:string, path:string, message:string}[]} */
  const problems = [];
  const error = (code, path, message) => problems.push({ severity: 'error', code, path, message });
  const warn = (code, path, message) => problems.push({ severity: 'warning', code, path, message });

  /* -------- unfinished transactions -------- */
  const transactions = [];
  for (const outcome of recoverTransactions(store, { dryRun: true })) {
    transactions.push(outcome);
    if (outcome.action === 'ambiguous') {
      error('TRANSACTION_UNRESOLVED', `.faro/.txn/${outcome.id}`, `${outcome.detail} — resolve it by hand; \`faro recover\` will not guess`);
    } else {
      warn('TRANSACTION_PENDING', `.faro/.txn/${outcome.id}`, `${outcome.detail} — run \`faro recover\``);
    }
  }

  /* -------- project identity -------- */
  let project = null;
  if (!exists(store, 'project.json')) {
    error('FILE_MISSING', '.faro/project.json', 'the canonical project file is missing');
  } else {
    try {
      const read = readProject(store);
      project = read.data;
      for (const issue of read.issues) error('SCHEMA_INVALID', `.faro/project.json:${issue.path}`, issue.message);
    } catch (err) {
      error(err.code ?? 'UNREADABLE', '.faro/project.json', err.message);
    }
  }

  /* -------- charter -------- */
  let charter = null;
  const charterIds = { objectives: new Set(), deliveries: new Set(), milestones: new Set(), principles: new Set() };
  if (!exists(store, 'charter/charter.md')) {
    error('FILE_MISSING', '.faro/charter/charter.md', 'the Project Charter is missing');
  } else {
    const read = safeRead(store, 'charter/charter.md', 'charter', problems);
    if (read) {
      charter = read.data;
      for (const objective of charter.objectives ?? []) charterIds.objectives.add(objective.id);
      for (const delivery of charter.deliveries ?? []) charterIds.deliveries.add(delivery.id);
      for (const milestone of charter.milestones ?? []) charterIds.milestones.add(milestone.id);
      for (const principle of charter.principles ?? []) charterIds.principles.add(principle.id);
      duplicates(charter.objectives).forEach((id) => error('DUPLICATE_ID', '.faro/charter/charter.md', `objective ${id} is declared twice`));
      duplicates(charter.deliveries).forEach((id) => error('DUPLICATE_ID', '.faro/charter/charter.md', `delivery ${id} is declared twice`));
      duplicates(charter.milestones).forEach((id) => error('DUPLICATE_ID', '.faro/charter/charter.md', `milestone ${id} is declared twice`));
      if (charter.status === 'draft') {
        warn('CHARTER_DRAFT', '.faro/charter/charter.md', 'the Project Charter is still a draft — direction is not agreed yet');
      }
    }
  }

  /* -------- requirements -------- */
  const requirementVersions = new Map();
  const requirements = listRequirements(store);
  for (const entry of requirements) {
    if (entry.versions.length === 0) {
      error('EMPTY_ITEM', `.faro/requirements/${entry.id}`, 'the requirement directory has no version file');
      continue;
    }
    const expected = entry.versions.map((_, index) => index + 1);
    if (entry.versions.join(',') !== expected.join(',')) {
      error('VERSION_GAP', `.faro/requirements/${entry.id}`, `version files must be v1..vN without gaps, found v${entry.versions.join(', v')}`);
    }
    requirementVersions.set(entry.id, new Set(entry.versions));
    for (const version of entry.versions) {
      const relative = `requirements/${entry.id}/v${version}.md`;
      const read = safeRead(store, relative, 'requirement', problems);
      if (!read) continue;
      if (read.data.id !== entry.id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its directory ${entry.id}`);
      if (read.data.version !== version) error('VERSION_MISMATCH', `.faro/${relative}`, `front matter version ${read.data.version} does not match file v${version}.md`);
      if (version > 1 && !read.data.revision_of) {
        error('MISSING_LINEAGE', `.faro/${relative}`, 'a version above v1 must record revision_of');
      }
      checkCharterRefs(read.data, `.faro/${relative}`, charterIds, charter, error);
    }
  }
  for (const entry of requirements) {
    for (const version of entry.versions) {
      const relative = `requirements/${entry.id}/v${version}.md`;
      const read = tryRead(store, relative, 'requirement');
      if (!read) continue;
      if (read.data.revision_of && !versionExists(read.data.revision_of, requirementVersions)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `revision_of points at ${read.data.revision_of}, which does not exist`);
      }
      for (const ref of read.data.supersedes ?? []) {
        if (!versionExists(ref, requirementVersions)) {
          error('BROKEN_REFERENCE', `.faro/${relative}`, `supersedes points at ${ref}, which does not exist`);
        }
      }
      for (const relation of read.data.relations ?? []) {
        if (!knownItem(relation.target, requirementVersions, store)) {
          error('BROKEN_REFERENCE', `.faro/${relative}`, `relation ${relation.type} points at ${relation.target}, which does not exist`);
        }
      }
    }
  }

  /* -------- decisions -------- */
  const decisions = listDecisions(store);
  for (const entry of decisions) {
    if (entry.versions.length === 0) {
      error('EMPTY_ITEM', `.faro/decisions/${entry.id}`, 'the decision directory has no version file');
      continue;
    }
    for (const version of entry.versions) {
      const relative = `decisions/${entry.id}/v${version}.md`;
      const read = safeRead(store, relative, 'decision', problems);
      if (!read) continue;
      if (read.data.id !== entry.id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its directory ${entry.id}`);
      for (const ref of read.data.constrains ?? []) {
        if (!knownItem(ref, requirementVersions, store) && !charterIds.principles.has(ref) && !charterIds.objectives.has(ref)) {
          error('BROKEN_REFERENCE', `.faro/${relative}`, `constrains points at ${ref}, which does not exist`);
        }
      }
    }
  }

  /* -------- knowledge -------- */
  const knowledge = listKnowledge(store);
  for (const id of knowledge) {
    const relative = `knowledge/${id}.md`;
    const read = safeRead(store, relative, 'knowledge', problems);
    if (!read) continue;
    if (read.data.id !== id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its filename`);
    for (const ref of read.data.relates_to ?? []) {
      if (!knownItem(ref, requirementVersions, store)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `relates_to points at ${ref}, which does not exist`);
      }
    }
  }

  /* -------- baselines -------- */
  const baselineStatus = new Map();
  const baselines = listBaselines(store);
  for (const id of baselines) {
    const relative = `baselines/${id}.md`;
    const read = safeRead(store, relative, 'baseline', problems);
    if (!read) continue;
    baselineStatus.set(id, read.data.status);
    if (read.data.status === 'active' && !read.data.approved_by) {
      error('UNAPPROVED_BASELINE', `.faro/${relative}`, 'an active baseline must record approved_by and approved_at');
    }
    for (const ref of read.data.requirements ?? []) {
      if (!versionExists(ref, requirementVersions)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `baseline selects ${ref}, which does not exist`);
      }
    }
  }

  /* -------- obligations -------- */
  const obligations = [];
  const intakeIds = new Set(listIntakeRecords(store));
  for (const id of listObligations(store)) {
    const relative = `obligations/${id}.md`;
    const read = safeRead(store, relative, 'obligation', problems);
    if (!read) continue;
    obligations.push({ id, ...read.data });
    if (read.data.id !== id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its filename`);
    if (!exists(store, `intake/proposals/${read.data.origin}.md`)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `origin ${read.data.origin} does not exist`);
    }
    if (!intakeIds.has(read.data.intake)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `intake ${read.data.intake} does not exist`);
    }
    for (const ref of read.data.related_requirements ?? []) {
      if (!knownItem(ref, requirementVersions, store)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `related_requirements names ${ref}, which does not exist`);
      }
    }
    if (read.data.status !== 'unrouted' && !read.data.closed_at) {
      error('MISSING_LINEAGE', `.faro/${relative}`, `a ${read.data.status} obligation must record closed_at and closure_reason`);
    }
  }
  const unrouted = obligations.filter((item) => item.status === 'unrouted');
  if (unrouted.length > 0) {
    // Accepted work that admission cannot fulfil. Not a defect — but the project
    // is not finished either, and saying nothing here would imply it was.
    warn(
      'OBLIGATIONS_UNROUTED',
      '.faro/obligations',
      `${unrouted.length} accepted obligation(s) are still open: ${unrouted.map((item) => item.id).join(', ')}`,
    );
  }

  /* -------- intake and proposals -------- */
  for (const id of intakeIds) safeRead(store, `intake/records/${id}.md`, 'intake', problems);

  const lookups = factLookups(store);
  const proposals = [];
  for (const id of listProposals(store)) {
    const relative = `intake/proposals/${id}.md`;
    const read = safeRead(store, relative, 'proposal', problems);
    if (!read) continue;
    proposals.push({ id, status: read.data.status, data: read.data });
    if (read.data.id !== id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its filename`);
    if (!intakeIds.has(read.data.intake)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `intake ${read.data.intake} does not exist`);
    }
    checkProposal(store, read, relative, lookups, { error, warn });
  }

  /* -------- repositories routing may probe -------- */
  let repositories = [];
  let repositoriesDeclared = false;
  try {
    const registry = readRepositories(store);
    repositories = registry.repositories;
    repositoriesDeclared = registry.declared;
    for (const issue of registry.issues) error('SCHEMA_INVALID', `.faro/repositories.json:${issue.path}`, issue.message);
    for (const repository of repositories) {
      if (!repository.present) {
        error('REPOSITORY_MISSING', '.faro/repositories.json', `repository "${repository.id}" points at ${repository.root}, which does not exist`);
      }
    }
  } catch (err) {
    error(err.code ?? 'UNREADABLE', '.faro/repositories.json', err.message);
  }
  const repositoryIds = new Set(repositories.map((entry) => entry.id));

  /* -------- routing: signatures, investigations, routes -------- */
  const signatures = [];
  for (const id of listSignatures(store)) {
    const relative = `signatures/${id}.md`;
    const read = safeRead(store, relative, 'signature', problems);
    if (!read) continue;
    signatures.push({ id, ...read.data });
    if (read.data.id !== id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its filename`);
    if (!exists(store, read.data.source.path)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `source ${read.data.source.path} does not exist`);
    }
    checkCharterRefs(
      {
        aligns_to_objectives: read.data.alignment?.objectives,
        contributes_to_deliveries: read.data.alignment?.deliveries,
        targets_milestones: read.data.alignment?.milestones,
      },
      `.faro/${relative}`,
      charterIds,
      charter,
      error,
    );
    if (read.data.status === 'current' && !routingFreshness(store, read.data).fresh) {
      warn('SIGNATURE_STALE', `.faro/${relative}`, `${routingFreshness(store, read.data).changed[0]} — recompile it before routing`);
    }
  }

  const investigations = [];
  for (const id of listInvestigations(store)) {
    const relative = `investigations/${id}.md`;
    const read = safeRead(store, relative, 'investigation', problems);
    if (!read) continue;
    investigations.push({ id, ...read.data });
    if (!exists(store, `signatures/${read.data.signature}.md`)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `signature ${read.data.signature} does not exist`);
    }
    for (const probe of read.data.probes ?? []) {
      if (!repositoryIds.has(probe.repository)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `probe ${probe.probe_id} names repository "${probe.repository}", which is not registered`);
      }
    }
  }
  const investigationById = new Map(investigations.map((entry) => [entry.id, entry]));

  const routes = [];
  for (const id of listRoutes(store)) {
    const relative = `routes/${id}.md`;
    const read = safeRead(store, relative, 'route', problems);
    if (!read) continue;
    const freshness = routingFreshness(store, read.data);
    const open = ['draft', 'review_required', 'approved'].includes(read.data.status);
    routes.push({ id, ...read.data, fresh: freshness.fresh, changed: freshness.changed });
    if (read.data.id !== id) error('ID_MISMATCH', `.faro/${relative}`, `front matter id "${read.data.id}" does not match its filename`);
    if (!exists(store, `signatures/${read.data.signature}.md`)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `signature ${read.data.signature} does not exist`);
    }
    if (!exists(store, `investigations/${read.data.investigation}.md`)) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `investigation ${read.data.investigation} does not exist`);
    }
    for (const entry of read.data.repositories ?? []) {
      if (!repositoryIds.has(entry.id)) {
        error('BROKEN_REFERENCE', `.faro/${relative}`, `names repository "${entry.id}", which is not registered`);
      }
    }
    for (const group of ['read_scope', 'write_scope', 'protected_scope', 'excluded_scope']) {
      for (const entry of read.data.scope?.[group] ?? []) {
        if (!repositoryIds.has(entry.repository)) {
          error('BROKEN_REFERENCE', `.faro/${relative}`, `${group} names repository "${entry.repository}", which is not registered`);
        }
        if (entry.path.startsWith('/') || entry.path.split('/').includes('..')) {
          error('PATH_ESCAPE', `.faro/${relative}`, `${group} entry "${entry.path}" must be a relative path inside the repository`);
        }
      }
    }

    const provisional = read.data.rebase && read.data.rebase.reconsidered !== true;
    for (const issue of validateRoute(read.data, investigationById.get(read.data.investigation) ?? null, lookups)) {
      if (provisional) warn('ROUTE_PROVISIONAL', `.faro/${relative}:${issue.path}`, `${issue.message} (carried from ${read.data.rebase.routed_from}; reconsider it)`);
      else error('ROUTE_INVALID', `.faro/${relative}:${issue.path}`, issue.message);
    }

    const computed = requiredRouteApproval(read.data);
    if (computed.level === 'human' && read.data.approval?.required !== 'human' && !provisional) {
      error('ROUTE_APPROVAL_UNDERSTATED', `.faro/${relative}`, `approval.required must be "human" because ${computed.reasons[0]}`);
    }
    if (read.data.approval?.granted === true && !read.data.approval.granted_by) {
      error('APPROVAL_UNSIGNED', `.faro/${relative}`, 'granted route approval must record granted_by and granted_at');
    }
    if (read.data.status === 'superseded' && !read.data.superseded_by) {
      error('MISSING_LINEAGE', `.faro/${relative}`, 'a superseded route must name the successor that replaced it');
    }
    if (open && !freshness.fresh) {
      warn('ROUTE_STALE', `.faro/${relative}`, `${freshness.changed[0]} — run \`faro route-rebase ${id}\``);
    }
    if (open && provisional) {
      warn('ROUTE_REBASE_PENDING', `.faro/${relative}`, `rebased from ${read.data.rebase.routed_from}; the route has not been reconsidered yet`);
    }
    if (read.data.status === 'review_required' && read.data.approval?.granted !== true) {
      warn('ROUTE_APPROVAL_PENDING', `.faro/${relative}`, 'waiting for human approval before this route can be used');
    }
  }

  /* -------- generated views -------- */
  const views = allViewStatuses(store);
  for (const view of views) {
    if (view.state === 'missing') warn('VIEW_MISSING', `.faro/${view.relative}`, `${view.reason} — run \`faro render\``);
    if (view.state === 'stale') warn('VIEW_STALE', `.faro/${view.relative}`, `${view.reason} — run \`faro render\``);
    if (view.state === 'invalid') error('VIEW_INVALID', `.faro/${view.relative}`, view.reason);
  }

  const hasError = problems.some((problem) => problem.severity === 'error');
  const hasWarning = problems.some((problem) => problem.severity === 'warning');
  return {
    status: hasError ? 'invalid' : hasWarning ? 'warning' : 'healthy',
    project,
    charter: charter
      ? {
          version: charter.charter_version,
          status: charter.status,
          updatedAt: charter.updated_at,
          objectives: (charter.objectives ?? []).length,
          deliveries: (charter.deliveries ?? []).length,
          milestones: (charter.milestones ?? []).length,
          principles: (charter.principles ?? []).length,
          successMeasures: (charter.success_measures ?? []).length,
          stakeholders: (charter.stakeholders ?? []).length,
          scopeIncluded: (charter.scope?.included ?? []).length,
          scopeExcluded: (charter.scope?.excluded ?? []).length,
        }
      : null,
    registries: {
      requirements: requirements.length,
      requirementVersions: requirements.reduce((sum, item) => sum + item.versions.length, 0),
      decisions: decisions.length,
      knowledge: knowledge.length,
      baselines: baselines.length,
      activeBaselines: [...baselineStatus.entries()].filter(([, status]) => status === 'active').map(([id]) => id),
      obligations: obligations.length,
      signatures: signatures.length,
      investigations: investigations.length,
      routes: routes.length,
      probes: investigations.reduce((sum, entry) => sum + (entry.probes ?? []).length, 0),
      repositories: repositories.length,
      intakeRecords: intakeIds.size,
      proposals: {
        total: proposals.length,
        draft: proposals.filter((p) => p.status === 'draft').length,
        approved: proposals.filter((p) => p.status === 'approved').length,
        applied: proposals.filter((p) => p.status === 'applied').length,
        rejected: proposals.filter((p) => p.status === 'rejected').length,
        superseded: proposals.filter((p) => p.status === 'superseded').length,
      },
    },
    openProposals: proposals
      .filter((p) => p.status === 'draft' || p.status === 'approved')
      .map((p) => ({
        id: p.id,
        status: p.status,
        classification: p.data.classification?.primary,
        confidence: p.data.classification?.confidence,
        approvalRequired: p.data.approval?.required,
        approvalGranted: p.data.approval?.granted === true,
        contextFresh: proposalFreshness(store, p.data).fresh,
        rebasedFrom: p.data.rebase?.rebased_from ?? null,
        reconsidered: p.data.rebase ? p.data.rebase.reconsidered === true : null,
      })),
    repositories: repositories.map((entry) => ({ id: entry.id, root: entry.root, role: entry.role, present: entry.present, declared: repositoriesDeclared })),
    openRoutes: routes
      .filter((entry) => ['draft', 'review_required', 'approved'].includes(entry.status))
      .map((entry) => ({
        id: entry.id,
        signature: entry.signature,
        status: entry.status,
        confidence: entry.routing_confidence,
        approvalRequired: entry.approval?.required,
        approvalGranted: entry.approval?.granted === true,
        fresh: entry.fresh,
        isolation: entry.execution_boundary?.recommended_isolation,
        writeScope: (entry.scope?.write_scope ?? []).length,
        rebasedFrom: entry.rebase?.routed_from ?? null,
        reconsidered: entry.rebase ? entry.rebase.reconsidered === true : null,
      })),
    openObligations: unrouted.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      origin: item.origin,
      intake: item.intake,
      pendingReason: item.pending_reason,
    })),
    transactions,
    views,
    problems,
  };
}

/* ------------------------------------------------------------- proposals */

/**
 * A proposal is bound to the exact canonical files it was reasoned from.
 * Unrelated project movement leaves it valid; a change to a bound source does not.
 * @param {import('./store.mjs').Store} store
 * @param {Record<string, any>} proposal
 */
export function proposalFreshness(store, proposal) {
  const changed = [];
  for (const binding of proposal.context_bindings ?? []) {
    if (!exists(store, binding.path)) {
      changed.push(`${binding.path} no longer exists`);
      continue;
    }
    const current = hashText(readUtf8(storePath(store, binding.path)));
    if (current !== binding.hash) changed.push(`${binding.path} changed since the proposal was created`);
  }
  return { fresh: changed.length === 0, changed };
}

function checkProposal(store, read, relative, lookups, report) {
  const { error, warn } = report;
  const proposal = read.data;
  const primary = proposal.classification?.primary;
  const allowed = CLASSIFICATION_OPS[primary] ?? [];

  for (const change of proposal.changes ?? []) {
    if (!allowed.includes(change.op)) {
      error('OP_NOT_ALLOWED', `.faro/${relative}`, `classification "${primary}" may not perform "${change.op}"`);
    }
    const draft = `${relative.replace(/\.md$/, '')}.draft/${change.draft}`;
    if (!exists(store, draft)) {
      error('DRAFT_MISSING', `.faro/${relative}`, `change "${change.op}" references draft ${change.draft}, which does not exist`);
    }
    if ((change.op === 'revise_requirement' || change.op === 'revise_decision' || change.op === 'update_knowledge') && !change.target) {
      error('MISSING_TARGET', `.faro/${relative}`, `"${change.op}" must name the item it revises via target`);
    }
    if (change.op === 'revise_requirement' && change.target && lookups.requirementStatus(change.target) === undefined) {
      error('BROKEN_REFERENCE', `.faro/${relative}`, `"${change.op}" targets ${change.target}, which does not exist`);
    }
  }

  for (const binding of proposal.context_bindings ?? []) {
    if (UNBINDABLE_PATHS.includes(binding.path)) {
      error(
        'UNBINDABLE_SOURCE',
        `.faro/${relative}`,
        `binds to ${binding.path}, which changes on every commit and carries no meaning a classification can rest on`,
      );
    }
  }

  // An un-reconsidered rebase carries the original's assertions forward as a
  // starting point. They are provisional by construction and the proposal cannot
  // be applied, so judging them as defects would report work-in-progress as
  // corruption. Full checks resume the moment it is reconsidered.
  const provisional = proposal.rebase && proposal.rebase.reconsidered !== true;

  for (const issue of validateSemanticFacts(proposal, lookups)) {
    if (provisional) warn('SEMANTIC_FACTS_PROVISIONAL', `.faro/${relative}:${issue.path}`, `${issue.message} (carried from ${proposal.rebase.rebased_from}; reconsider it)`);
    else error('SEMANTIC_FACTS_INVALID', `.faro/${relative}:${issue.path}`, issue.message);
  }

  const computed = requiredApproval(proposal);
  if (computed.level === 'human' && proposal.approval?.required !== 'human' && !provisional) {
    error('APPROVAL_UNDERSTATED', `.faro/${relative}`, `approval.required must be "human" because ${computed.reasons[0]}`);
  }
  if (proposal.approval?.granted === true && !proposal.approval.granted_by) {
    error('APPROVAL_UNSIGNED', `.faro/${relative}`, 'granted approval must record granted_by and granted_at');
  }
  if (proposal.status === 'applied' && !proposal.applied_at) {
    error('MISSING_LINEAGE', `.faro/${relative}`, 'an applied proposal must record applied_at');
  }
  if (proposal.status === 'superseded' && !proposal.superseded_by) {
    error('MISSING_LINEAGE', `.faro/${relative}`, 'a superseded proposal must name the successor that replaced it');
  }

  if (proposal.status === 'draft' || proposal.status === 'approved') {
    const freshness = proposalFreshness(store, proposal);
    if (!freshness.fresh) {
      warn('PROPOSAL_STALE', `.faro/${relative}`, `${freshness.changed[0]} — run \`faro rebase ${proposal.id}\``);
    }
    if (proposal.rebase && proposal.rebase.reconsidered !== true) {
      warn('REBASE_PENDING', `.faro/${relative}`, `rebased from ${proposal.rebase.rebased_from}; classification has not been reconsidered yet`);
    }
    if (proposal.approval?.required === 'human' && proposal.approval.granted !== true) {
      warn('APPROVAL_PENDING', `.faro/${relative}`, 'waiting for human approval');
    }
  }
}

/* --------------------------------------------------------------- helpers */

function safeRead(store, relative, type, problems) {
  try {
    const read = readItem(store, relative, type);
    for (const issue of read.issues) {
      problems.push({ severity: 'error', code: 'SCHEMA_INVALID', path: `.faro/${relative}:${issue.path}`, message: issue.message });
    }
    return read;
  } catch (err) {
    problems.push({
      severity: 'error',
      code: err instanceof FaroError ? err.code : 'UNREADABLE',
      path: `.faro/${relative}`,
      message: err.message,
    });
    return null;
  }
}

function tryRead(store, relative, type) {
  try {
    return readItem(store, relative, type);
  } catch {
    return null;
  }
}

function checkCharterRefs(data, path, charterIds, charter, error) {
  if (!charter) return;
  for (const id of data.aligns_to_objectives ?? []) {
    if (!charterIds.objectives.has(id)) error('BROKEN_REFERENCE', path, `aligns_to_objectives names ${id}, which is not in the charter`);
  }
  for (const id of data.contributes_to_deliveries ?? []) {
    if (!charterIds.deliveries.has(id)) error('BROKEN_REFERENCE', path, `contributes_to_deliveries names ${id}, which is not in the charter`);
  }
  for (const id of data.targets_milestones ?? []) {
    if (!charterIds.milestones.has(id)) error('BROKEN_REFERENCE', path, `targets_milestones names ${id}, which is not in the charter`);
  }
}

function versionExists(ref, requirementVersions) {
  if (!VERSION_REF.test(ref)) return false;
  const [id, version] = ref.split('@');
  return requirementVersions.get(id)?.has(Number.parseInt(version, 10)) === true;
}

/** Does a bare id (REQ-/DEC-/KNW-/BL-/OBL-/OBJ-…) refer to something that exists? */
function knownItem(ref, requirementVersions, store) {
  if (VERSION_REF.test(ref)) return versionExists(ref, requirementVersions);
  if (/^REQ-\d{4}$/.test(ref)) return requirementVersions.has(ref);
  if (/^DEC-\d{4}$/.test(ref)) return listDecisions(store).some((item) => item.id === ref);
  if (/^KNW-\d{4}$/.test(ref)) return listKnowledge(store).includes(ref);
  if (/^BL-\d{4}$/.test(ref)) return listBaselines(store).includes(ref);
  if (/^OBL-\d{4}$/.test(ref)) return listObligations(store).includes(ref);
  for (const pattern of Object.values(CHARTER_ID_PATTERNS)) if (pattern.test(ref)) return true;
  return false;
}

function duplicates(items) {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items ?? []) {
    if (seen.has(item.id)) repeated.add(item.id);
    seen.add(item.id);
  }
  return [...repeated];
}

/* ------------------------------------------------------------ formatting */

/** Render the report as the human-readable `faro inspect` output. */
export function formatReport(report, root) {
  const out = [];
  const badge = { healthy: 'HEALTHY', warning: 'WARNING', invalid: 'INVALID' }[report.status];
  out.push(`Faro project: ${report.project?.name ?? '(unknown)'}  [${badge}]`);
  out.push(
    `  id ${report.project?.projectId ?? '—'} · schema v${report.project?.schemaVersion ?? '—'} · faro ${report.project?.faroVersion ?? '—'} · store revision ${report.project?.storeRevision ?? '—'}`,
  );
  out.push(`  store ${root}`);
  out.push('');
  if (report.charter) {
    const c = report.charter;
    out.push(`Charter  v${c.version} (${c.status}) — ${c.objectives} objectives · ${c.deliveries} deliveries · ${c.milestones} milestones`);
    out.push(`         ${c.principles} principles · ${c.successMeasures} success measures · ${c.stakeholders} stakeholders · scope ${c.scopeIncluded} in / ${c.scopeExcluded} out`);
  } else {
    out.push('Charter  unavailable');
  }
  const r = report.registries;
  out.push('');
  out.push(`Registries  requirements ${r.requirements} (${r.requirementVersions} versions) · decisions ${r.decisions} · knowledge ${r.knowledge} · baselines ${r.baselines}`);
  if (r.activeBaselines.length > 0) out.push(`            active baseline: ${r.activeBaselines.join(', ')}`);
  out.push(`Routing     signatures ${r.signatures} · investigations ${r.investigations} (${r.probes} probes) · routes ${r.routes} · repositories ${r.repositories}`);
  out.push(
    `Intake      ${r.intakeRecords} records · proposals ${r.proposals.total} (draft ${r.proposals.draft} · approved ${r.proposals.approved} · applied ${r.proposals.applied} · rejected ${r.proposals.rejected} · superseded ${r.proposals.superseded})`,
  );
  if (report.openProposals.length > 0) {
    out.push('');
    out.push('Open proposals');
    for (const proposal of report.openProposals) {
      const approval = proposal.approvalRequired === 'human' ? (proposal.approvalGranted ? 'approved' : 'AWAITING APPROVAL') : 'auto-admissible';
      const freshness = proposal.contextFresh ? 'context fresh' : 'CONTEXT STALE';
      const rebase = proposal.rebasedFrom ? ` · rebased from ${proposal.rebasedFrom}${proposal.reconsidered ? '' : ' (NOT RECONSIDERED)'}` : '';
      out.push(`  ${proposal.id}  ${proposal.classification} (${proposal.confidence}) — ${approval} · ${freshness}${rebase}`);
    }
  }
  if (report.openObligations.length > 0) {
    out.push('');
    out.push('Accepted obligations still open');
    for (const obligation of report.openObligations) {
      out.push(`  ${obligation.id}  ${obligation.kind}  ${obligation.title}`);
      out.push(`          ${obligation.pendingReason}`);
    }
  }
  if (report.openRoutes.length > 0) {
    out.push('');
    out.push('Routes');
    for (const route of report.openRoutes) {
      const approval = route.approvalRequired === 'human' ? (route.approvalGranted ? 'approved' : 'AWAITING APPROVAL') : 'auto-admissible';
      const freshness = route.fresh ? 'bindings fresh' : 'BINDINGS STALE';
      const rebase = route.rebasedFrom ? ` · rebased from ${route.rebasedFrom}${route.reconsidered ? '' : ' (NOT RECONSIDERED)'}` : '';
      out.push(`  ${route.id}  ${route.signature} · ${route.confidence} confidence · ${route.isolation} isolation · ${route.writeScope} write target(s)`);
      out.push(`          ${route.status} · ${approval} · ${freshness}${rebase}`);
    }
  }
  if (report.transactions.length > 0) {
    out.push('');
    out.push('Unfinished transactions');
    for (const transaction of report.transactions) out.push(`  ${transaction.id}  ${transaction.action} — ${transaction.detail}`);
  }
  out.push('');
  out.push('Views');
  for (const view of report.views) out.push(`  ${view.state.padEnd(7)} .faro/${view.relative}${view.reason ? ` — ${view.reason}` : ''}`);
  if (report.problems.length > 0) {
    out.push('');
    out.push('Findings');
    for (const problem of report.problems) {
      out.push(`  ${problem.severity === 'error' ? 'error  ' : 'warning'} ${problem.path}`);
      out.push(`          ${problem.message}`);
    }
  }
  return out.join('\n');
}

/** Re-exported so the CLI has one import surface for inspection and recovery. */
export { recoverTransactions };
