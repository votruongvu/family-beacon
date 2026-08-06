/**
 * `faro rebase` — carry a stale proposal forward onto current project state.
 *
 * A stale proposal can never be forced through: its classification was reached
 * against a project that no longer exists, and applying it anyway would admit
 * reasoning nobody checked. But making the user retype the original idea throws
 * away the one thing that is still valid — the immutable intake record.
 *
 * So rebase splits the work the way the whole framework does:
 *
 *   the toolkit  allocates the successor, copies the drafts, records lineage,
 *                re-binds to current sources, supersedes the original, and
 *                refuses to let the successor be applied until it is reconsidered
 *
 *   Claude       re-reads the changed sources and re-runs classification and
 *                impact analysis, because a source change can genuinely change
 *                what the input *is*
 *
 * The successor starts with the original's assertions as a *starting point*, not
 * as an answer: `rebase.reconsidered` is false, approval is never inherited, and
 * `approval.required` never starts lower than the original's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { ordered } from './model.mjs';
import { now, hashText, readUtf8, ensureDir } from './fs-safe.mjs';
import { proposalFreshness } from './inspect.mjs';
import { beginTransaction, finalizeStaging, commitTransaction, abortTransaction } from './transaction.mjs';
import { readItem, writeItem, nextId, storePath, exists, sectionText, advanceStoreRevision } from './store.mjs';

/**
 * @param {import('./store.mjs').Store} store
 * @param {string} id the stale proposal
 * @returns {{ id: string, successor: string, changed: string[], transaction: string }}
 */
export function rebaseProposal(store, id) {
  const relative = `intake/proposals/${id}.md`;
  if (!/^PROP-\d{4}$/.test(id ?? '')) {
    throw new FaroError('INVALID_ID', `"${id}" is not a proposal id.`, { hint: 'Proposal ids look like PROP-0001.' });
  }
  if (!exists(store, relative)) {
    throw new FaroError('PROPOSAL_NOT_FOUND', `${id} does not exist.`, {
      hint: 'Run `faro inspect` to list open proposals.',
      path: `.faro/${relative}`,
    });
  }
  const original = readItem(store, relative, 'proposal');
  if (original.data.status !== 'draft' && original.data.status !== 'approved') {
    throw new FaroError('PROPOSAL_CLOSED', `${id} is ${original.data.status} and cannot be rebased.`, {
      hint: 'Rebase carries an open proposal forward. A closed one is already history.',
      path: `.faro/${relative}`,
    });
  }

  const freshness = proposalFreshness(store, original.data);
  if (freshness.fresh) {
    throw new FaroError('PROPOSAL_NOT_STALE', `${id} is still bound to current project state; there is nothing to rebase.`, {
      hint: `Apply it with \`faro apply ${id}\`, or capture a new intake if the idea itself has changed.`,
      path: `.faro/${relative}`,
    });
  }

  const successor = nextId(store, 'proposal');
  const txn = beginTransaction(store, id);
  try {
    const staged = txn.staged;

    // The successor starts from the original's drafts. Claude edits them during
    // reconsideration; copying beats retyping, and lineage records where they came from.
    const sourceDrafts = storePath(store, `intake/proposals/${id}.draft`);
    if (fs.existsSync(sourceDrafts)) {
      const targetDrafts = storePath(staged, `intake/proposals/${successor}.draft`);
      ensureDir(path.dirname(targetDrafts));
      fs.cpSync(sourceDrafts, targetDrafts, { recursive: true });
    }

    // Re-bind to the same sources at their current content.
    const bindings = (original.data.context_bindings ?? []).map((binding) => ({
      path: binding.path,
      hash: exists(staged, binding.path) ? hashText(readUtf8(storePath(staged, binding.path))) : null,
    }));
    const missing = bindings.filter((binding) => binding.hash === null).map((binding) => binding.path);
    if (missing.length === bindings.length) {
      throw new FaroError('REBASE_IMPOSSIBLE', `Every source ${id} was reasoned from has disappeared.`, {
        hint: `Capture a fresh intake instead; the original input is preserved in ${original.data.intake}.`,
      });
    }

    const successorData = ordered('proposal', {
      ...original.data,
      id: successor,
      status: 'draft',
      created_at: now(),
      // Approval is never inherited, and never starts lower than it was.
      approval: { required: original.data.approval?.required ?? 'none', granted: false },
      context_bindings: bindings.filter((binding) => binding.hash !== null),
      rebase: {
        rebased_from: id,
        rebased_at: now(),
        changed_bindings: freshness.changed,
        previous_classification: original.data.classification.primary,
        previous_impact_summary: summarise(original),
        reconsidered: false,
      },
      next_action: `Reconsider ${successor} with /faro-rebase, then apply it`,
      superseded_by: undefined,
      applied_at: undefined,
      applied_changes: undefined,
      applied_transaction: undefined,
      rejected_at: undefined,
      rejection_reason: undefined,
    });

    writeItem(staged, `intake/proposals/${successor}.md`, successorData, rebaseBody(original, id, freshness.changed));
    writeItem(
      staged,
      relative,
      ordered('proposal', { ...original.data, status: 'superseded', superseded_by: successor }),
      original.body,
    );

    // The intake record points at whichever proposal is currently live for it.
    const intakeRelative = `intake/records/${original.data.intake}.md`;
    if (exists(staged, intakeRelative)) {
      const intake = readItem(staged, intakeRelative, 'intake');
      writeItem(staged, intakeRelative, ordered('intake', { ...intake.data, proposal: successor }), intake.body);
    }

    // A rebase is a committed canonical mutation like any other, so it advances
    // the revision. Skipping it would let the next transaction reuse this id.
    advanceStoreRevision(staged, txn.id);

    finalizeStaging(store, txn, id);
    commitTransaction(store, txn);
    return { id, successor, changed: freshness.changed, transaction: txn.id, droppedBindings: missing };
  } catch (err) {
    abortTransaction(txn);
    throw err;
  }
}

/** A one-line record of what the original concluded, kept for comparison. */
function summarise(original) {
  const facts = original.data.semantic_facts ?? {};
  const asserted = Object.entries(facts)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.value === true)
    .map(([name]) => name);
  const ops = (original.data.changes ?? []).map((change) => change.op).join(', ') || 'no changes';
  return `${original.data.classification.primary} (${original.data.classification.confidence}); ops: ${ops}; facts asserted: ${asserted.join(', ') || 'none'}`;
}

function rebaseBody(original, previousId, changed) {
  return [
    '## Normalized summary',
    '',
    sectionText(original.body, 'Normalized summary') || `Carried forward from ${previousId}.`,
    '',
    '## Reasoning',
    '',
    `**Rebased from ${previousId}. The reasoning below is the original's and has not been reconsidered yet.**`,
    '',
    'These bound sources changed since it was written:',
    '',
    ...changed.map((entry) => `- ${entry}`),
    '',
    'Re-read them and reconsider the classification before setting `rebase.reconsidered: true` —',
    'a source change can turn a new requirement into a revision, an undefined behaviour into a',
    'bug, or an unaffected baseline into an amended one.',
    '',
    '### Original reasoning',
    '',
    sectionText(original.body, 'Reasoning') || '_none recorded_',
  ].join('\n');
}
