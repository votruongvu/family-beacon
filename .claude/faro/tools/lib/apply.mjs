/**
 * `faro approve` / `faro reject` / `faro apply`.
 *
 * Applying a proposal is the only path that mutates canonical project state, and
 * it is deliberately narrow:
 *
 *   1. the proposal must still be open
 *   2. its bound context must be unchanged (stale proposals are refused)
 *   3. its asserted semantic facts must not contradict what it actually does
 *   4. approval must be granted where the facts require a human
 *   5. every draft artifact must validate, and so must the resulting whole store
 *   6. only then is anything exposed, and all of it at once
 *
 * Step 5 runs entirely inside a staged copy of the store (see transaction.mjs),
 * so a failure at any point leaves the project exactly as it was. Step 6 changes
 * only the artifacts the proposal named and the views whose sources moved —
 * admitting one additive requirement still never touches the charter.
 */
import { FaroError } from './errors.mjs';
import { validate } from './schema.mjs';
import { now } from './fs-safe.mjs';
import {
  SCHEMA_VERSION,
  SCHEMAS,
  REQUIRED_SECTIONS,
  ASSIGNED_FIELDS,
  ordered,
  requiredApproval,
  validateSemanticFacts,
} from './model.mjs';
import { renderView } from './views.mjs';
import { proposalFreshness, validateStore, factLookups } from './inspect.mjs';
import { beginTransaction, finalizeStaging, commitTransaction, abortTransaction } from './transaction.mjs';
import {
  readItem,
  writeItem,
  nextId,
  listRequirements,
  listDecisions,
  readCharter,
  sectionText,
  advanceStoreRevision,
  exists,
} from './store.mjs';

/** Fields a draft may not set, beyond the global list, because apply owns them. */
const RESERVED_BY_TYPE = { obligation: ['status', 'intake'] };

/**
 * Record a human approval on a proposal.
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 * @param {string} by
 */
export function approveProposal(store, id, by) {
  const relative = `intake/proposals/${id}.md`;
  const proposal = readOpenProposal(store, id, relative);
  if (!by || by.trim() === '') {
    throw new FaroError('APPROVER_REQUIRED', 'Approval must name the person granting it.', {
      hint: `Run: /faro-approve ${id} --by "Your Name"`,
    });
  }
  const data = ordered('proposal', {
    ...proposal.data,
    status: 'approved',
    approval: { required: 'human', granted: true, granted_by: by.trim(), granted_at: now() },
  });
  writeItem(store, relative, data, proposal.body);
  return { id, approvedBy: by.trim() };
}

/**
 * Close a proposal without applying it. The record stays on disk: rejected
 * intake remains traceable and never silently disappears.
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 * @param {string} reason
 */
export function rejectProposal(store, id, reason) {
  const relative = `intake/proposals/${id}.md`;
  const proposal = readOpenProposal(store, id, relative);
  if (!reason || reason.trim() === '') {
    throw new FaroError('REASON_REQUIRED', 'Rejecting a proposal must record why.', {
      hint: `Run: /faro-reject ${id} --reason "why this is not admitted"`,
    });
  }
  const data = ordered('proposal', {
    ...proposal.data,
    status: 'rejected',
    rejected_at: now(),
    rejection_reason: reason.trim(),
  });
  writeItem(store, relative, data, proposal.body);
  return { id, reason: reason.trim() };
}

/**
 * Apply one open proposal as a single transaction.
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 */
export function applyProposal(store, id) {
  const relative = `intake/proposals/${id}.md`;
  const proposal = readOpenProposal(store, id, relative);
  const data = proposal.data;

  const freshness = proposalFreshness(store, data);
  if (!freshness.fresh) {
    throw new FaroError('PROPOSAL_STALE', `${id} was reasoned from project state that has since changed.`, {
      hint: `${freshness.changed.join('; ')}. Run \`/faro-rebase ${id}\` to reconsider it against the current project.`,
      path: `.faro/${relative}`,
    });
  }

  if (data.rebase && data.rebase.reconsidered !== true) {
    throw new FaroError('REBASE_NOT_RECONSIDERED', `${id} is a rebase whose classification has not been reconsidered yet.`, {
      hint: 'Run /faro-rebase to re-run classification and impact analysis, then set rebase.reconsidered: true.',
      path: `.faro/${relative}`,
    });
  }

  const factIssues = validateSemanticFacts(data, factLookups(store));
  if (factIssues.length > 0) {
    throw new FaroError('SEMANTIC_FACTS_INVALID', `${id} asserts semantic facts that contradict what it does.`, {
      hint: factIssues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      path: `.faro/${relative}`,
    });
  }

  const policy = requiredApproval(data);
  if (policy.level === 'human' && data.approval?.granted !== true) {
    throw new FaroError('APPROVAL_REQUIRED', `${id} needs explicit human approval before it can be applied.`, {
      hint: `${policy.reasons.join('; ')}. Run: /faro-approve ${id} --by "Your Name"`,
      path: `.faro/${relative}`,
    });
  }

  const txn = beginTransaction(store, id);
  try {
    const staged = txn.staged;

    // Materialise every artifact into the staged store. Nothing here is visible
    // to a reader of the real store.
    const allocated = { requirement: [], decision: [], knowledge: [], obligation: [] };
    const applied = [];
    for (const change of data.changes ?? []) {
      const item = materialise(staged, data, change, allocated);
      writeItem(staged, item.relative, item.data, item.body);
      applied.push(item.label);
    }

    writeItem(
      staged,
      relative,
      ordered('proposal', { ...data, status: 'applied', applied_at: now(), applied_changes: applied, applied_transaction: txn.id }),
      proposal.body,
    );

    // Only the views whose sources moved are regenerated — in the staged store,
    // so a failure cannot leave a half-regenerated view behind either.
    const ops = new Set((data.changes ?? []).map((change) => change.op));
    const rendered = [];
    if (ops.has('update_charter')) {
      rendered.push(renderView(staged, 'compass').relative, renderView(staged, 'requirements').relative);
    } else if (ops.has('create_requirement') || ops.has('revise_requirement')) {
      rendered.push(renderView(staged, 'requirements').relative);
    }

    advanceStoreRevision(staged, txn.id);

    // Validate the *result*, not the pieces: schemas, cross-references, view
    // freshness, and approval policy across the whole staged store.
    const report = validateStore(staged);
    if (report.status === 'invalid') {
      throw new FaroError('APPLY_WOULD_INVALIDATE_STORE', `Applying ${id} would leave the project invalid; nothing was written.`, {
        hint: report.problems
          .filter((problem) => problem.severity === 'error')
          .slice(0, 4)
          .map((problem) => `${problem.path}: ${problem.message}`)
          .join('; '),
      });
    }

    finalizeStaging(store, txn, id);
    const written = commitTransaction(store, txn);
    return { id, transaction: txn.id, written, rendered, appliedIds: applied };
  } catch (err) {
    abortTransaction(txn);
    throw err;
  }
}

/* --------------------------------------------------------------- planning */

function materialise(staged, proposal, change, allocated) {
  const proposalId = proposal.id;
  const draftRelative = `intake/proposals/${proposalId}.draft/${change.draft}`;
  if (!exists(staged, draftRelative)) {
    throw new FaroError('DRAFT_MISSING', `Draft ${change.draft} referenced by ${proposalId} does not exist.`, {
      hint: `Expected .faro/${draftRelative}`,
      path: `.faro/${draftRelative}`,
    });
  }
  const type = OP_TYPES[change.op];
  const draft = readDraft(staged, draftRelative, type);
  const timestamp = now();
  const origin = proposalId;

  switch (change.op) {
    case 'create_requirement': {
      const id = allocateId(staged, 'requirement', allocated);
      return finalise(staged, 'requirement', `requirements/${id}/v1.md`, `${id}@1`, {
        ...draft.data,
        faro_type: 'requirement',
        schema_version: SCHEMA_VERSION,
        id,
        version: 1,
        created_at: timestamp,
        origin,
      }, draft.body);
    }
    case 'revise_requirement': {
      const target = requireTarget(change, 'revise_requirement');
      const entry = listRequirements(staged).find((item) => item.id === target);
      if (!entry || entry.latest === 0) {
        throw new FaroError('BROKEN_REFERENCE', `Cannot revise ${target}: it does not exist.`, {
          hint: 'Check the proposal target, or create a new requirement instead.',
        });
      }
      const version = entry.latest + 1;
      return finalise(staged, 'requirement', `requirements/${target}/v${version}.md`, `${target}@${version}`, {
        ...draft.data,
        faro_type: 'requirement',
        schema_version: SCHEMA_VERSION,
        id: target,
        version,
        created_at: timestamp,
        origin,
        revision_of: `${target}@${entry.latest}`,
      }, draft.body);
    }
    case 'create_decision': {
      const id = allocateId(staged, 'decision', allocated);
      return finalise(staged, 'decision', `decisions/${id}/v1.md`, `${id}@1`, {
        ...draft.data,
        faro_type: 'decision',
        schema_version: SCHEMA_VERSION,
        id,
        version: 1,
        created_at: timestamp,
        origin,
      }, draft.body);
    }
    case 'revise_decision': {
      const target = requireTarget(change, 'revise_decision');
      const entry = listDecisions(staged).find((item) => item.id === target);
      if (!entry || entry.latest === 0) {
        throw new FaroError('BROKEN_REFERENCE', `Cannot revise ${target}: it does not exist.`, {
          hint: 'Check the proposal target, or create a new decision instead.',
        });
      }
      const version = entry.latest + 1;
      return finalise(staged, 'decision', `decisions/${target}/v${version}.md`, `${target}@${version}`, {
        ...draft.data,
        faro_type: 'decision',
        schema_version: SCHEMA_VERSION,
        id: target,
        version,
        created_at: timestamp,
        origin,
        revision_of: `${target}@${entry.latest}`,
      }, draft.body);
    }
    case 'create_knowledge': {
      const id = allocateId(staged, 'knowledge', allocated);
      return finalise(staged, 'knowledge', `knowledge/${id}.md`, id, {
        ...draft.data,
        faro_type: 'knowledge',
        schema_version: SCHEMA_VERSION,
        id,
        created_at: timestamp,
        origin,
      }, draft.body);
    }
    case 'update_knowledge': {
      const target = requireTarget(change, 'update_knowledge');
      const existing = readItem(staged, `knowledge/${target}.md`, 'knowledge');
      return finalise(staged, 'knowledge', `knowledge/${target}.md`, target, {
        ...draft.data,
        faro_type: 'knowledge',
        schema_version: SCHEMA_VERSION,
        id: target,
        created_at: existing.data.created_at,
        updated_at: timestamp,
        origin,
      }, draft.body);
    }
    case 'create_obligation': {
      const id = allocateId(staged, 'obligation', allocated);
      return finalise(staged, 'obligation', `obligations/${id}.md`, id, {
        ...draft.data,
        faro_type: 'obligation',
        schema_version: SCHEMA_VERSION,
        id,
        // Admission can accept an obligation; it cannot fulfil one.
        status: 'unrouted',
        created_at: timestamp,
        origin,
        intake: proposal.intake,
      }, draft.body);
    }
    case 'update_charter': {
      const current = readCharter(staged);
      const version = current.data.charter_version + 1;
      // The superseded charter is archived, never overwritten.
      writeItem(staged, `charter/_history/v${current.data.charter_version}.md`, ordered('charter', current.data), current.body);
      return finalise(staged, 'charter', 'charter/charter.md', `charter@${version}`, {
        ...draft.data,
        faro_type: 'charter',
        schema_version: SCHEMA_VERSION,
        charter_version: version,
        updated_at: timestamp,
        origin,
      }, draft.body);
    }
    default:
      throw new FaroError('UNSUPPORTED_OP', `"${change.op}" is not an operation faro apply can perform.`, {
        hint: 'Supported operations are listed in .claude/faro/tools/lib/model.mjs (CHANGE_OPS).',
      });
  }
}

const OP_TYPES = {
  create_requirement: 'requirement',
  revise_requirement: 'requirement',
  create_decision: 'decision',
  revise_decision: 'decision',
  create_knowledge: 'knowledge',
  update_knowledge: 'knowledge',
  create_obligation: 'obligation',
  update_charter: 'charter',
};

function readDraft(store, relative, type) {
  const raw = readItem(store, relative, type);
  if (raw.data.faro_type !== type) {
    throw new FaroError('DRAFT_TYPE_MISMATCH', `Draft ${relative} declares faro_type "${raw.data.faro_type}" but the change needs "${type}".`, {
      hint: `Set faro_type: ${type} in the draft's front matter.`,
      path: `.faro/${relative}`,
    });
  }
  for (const field of [...ASSIGNED_FIELDS, ...(RESERVED_BY_TYPE[type] ?? [])]) {
    if (field in raw.data) {
      throw new FaroError('DRAFT_ASSIGNS_RESERVED_FIELD', `Draft ${relative} sets "${field}", which faro apply assigns.`, {
        hint: `Remove "${field}" from the draft. Identity, version, lineage, and timestamps are assigned when the proposal is applied.`,
        path: `.faro/${relative}`,
      });
    }
  }
  for (const heading of REQUIRED_SECTIONS[type] ?? []) {
    if (sectionText(raw.body, heading) === '') {
      throw new FaroError('DRAFT_INCOMPLETE', `Draft ${relative} is missing the "## ${heading}" section.`, {
        hint: `Every ${type} needs: ${REQUIRED_SECTIONS[type].map((item) => `## ${item}`).join(', ')}.`,
        path: `.faro/${relative}`,
      });
    }
  }
  return raw;
}

function finalise(store, type, relative, label, data, body) {
  const shaped = ordered(type, data);
  const issues = validate(shaped, SCHEMAS[type], '');
  if (issues.length > 0) {
    throw new FaroError('DRAFT_INVALID', `The draft for ${label} would produce an invalid ${type}.`, {
      hint: issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      path: `.faro/${relative}`,
    });
  }
  return { relative, data: shaped, body, label, type };
}

function allocateId(store, kind, allocated) {
  // nextId reads the store, so ids allocated earlier in this same apply are
  // tracked here to keep a multi-artifact proposal from reusing one.
  let candidate = nextId(store, kind);
  while (allocated[kind].includes(candidate)) {
    const [prefix, number] = candidate.split('-');
    candidate = `${prefix}-${String(Number.parseInt(number, 10) + 1).padStart(4, '0')}`;
  }
  allocated[kind].push(candidate);
  return candidate;
}

function requireTarget(change, op) {
  if (!change.target) {
    throw new FaroError('MISSING_TARGET', `"${op}" must name the item it revises.`, {
      hint: 'Add a `target:` field to the change entry in the proposal.',
    });
  }
  return change.target;
}

/** @returns {{ data: Record<string, any>, body: string }} */
export function readOpenProposal(store, id, relative) {
  if (!/^PROP-\d{4}$/.test(id ?? '')) {
    throw new FaroError('INVALID_ID', `"${id}" is not a proposal id.`, { hint: 'Proposal ids look like PROP-0001.' });
  }
  if (!exists(store, relative)) {
    throw new FaroError('PROPOSAL_NOT_FOUND', `${id} does not exist.`, {
      hint: 'Run `/faro-inspect` to list open proposals.',
      path: `.faro/${relative}`,
    });
  }
  const proposal = readItem(store, relative, 'proposal');
  if (proposal.issues.length > 0) {
    throw new FaroError('PROPOSAL_INVALID', `${id} does not satisfy the proposal schema.`, {
      hint: proposal.issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      path: `.faro/${relative}`,
    });
  }
  if (proposal.data.status !== 'draft' && proposal.data.status !== 'approved') {
    throw new FaroError('PROPOSAL_CLOSED', `${id} is already ${proposal.data.status}.`, {
      hint: proposal.data.status === 'superseded'
        ? `A rebase replaced it with ${proposal.data.superseded_by ?? 'a successor'}.`
        : 'Capture a new intake instead of reopening a closed proposal.',
      path: `.faro/${relative}`,
    });
  }
  return proposal;
}
