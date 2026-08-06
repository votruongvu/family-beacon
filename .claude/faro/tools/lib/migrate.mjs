/**
 * `faro migrate` — carry a schema v1 store forward to v2.
 *
 * Three things changed, and each migrates deterministically from data the v1
 * store already holds. Nothing is invented, and no historical artifact is
 * rewritten beyond its `schema_version` stamp.
 *
 *   project.json    `updatedAt` was derived with no owner and mutated on every
 *                   commit; it becomes `storeRevision` + `lastTransaction`.
 *
 *   proposals       `baseline_impact` and the ad-hoc approval inputs become the
 *                   versioned `semantic_facts` contract. Every fact is derived
 *                   from a structured v1 field — never from prose.
 *
 *   bug/work_unit   `changes: []` + `no_change_reason` becomes a real obligation,
 *                   so accepted work stays visible instead of closing silently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { readDocument } from './frontmatter.mjs';
import { SCHEMA_VERSION, SEMANTIC_FACTS_VERSION, COMMITTED_REQUIREMENT_STATUS, ordered } from './model.mjs';
import { readUtf8, writeAtomic, hashText, now } from './fs-safe.mjs';
import { renderAllViews } from './views.mjs';
import {
  storePath,
  exists,
  readItem,
  writeItem,
  readProject,
  writeProject,
  listRequirements,
  listDecisions,
  listKnowledge,
  listBaselines,
  listIntakeRecords,
  listProposals,
  nextId,
} from './store.mjs';

/**
 * @param {import('./store.mjs').Store} store
 * @param {{ dryRun?: boolean }} [options]
 * @returns {{ from: number, to: number, actions: string[] }}
 */
export function migrateStore(store, options = {}) {
  const { data: project } = readProject(store);
  const from = project.schemaVersion ?? 1;
  if (from === SCHEMA_VERSION) {
    throw new FaroError('MIGRATION_NOT_NEEDED', `This project is already at schema v${SCHEMA_VERSION}.`, {
      hint: 'Run `/faro-inspect` to check its health.',
    });
  }
  if (from > SCHEMA_VERSION) {
    throw new FaroError('MIGRATION_UNSUPPORTED', `This project is at schema v${from}, newer than this toolkit understands (v${SCHEMA_VERSION}).`, {
      hint: 'Upgrade Faro rather than downgrading the project.',
    });
  }
  if (from !== 1) {
    throw new FaroError('MIGRATION_UNSUPPORTED', `No migration path from schema v${from} to v${SCHEMA_VERSION}.`, {
      hint: 'Only v1 → v2 is implemented.',
    });
  }

  const actions = [];
  const apply = (message, work) => {
    actions.push(message);
    if (!options.dryRun) work();
  };

  const requirementStatus = new Map();
  for (const entry of listRequirements(store)) {
    if (entry.latest === 0) continue;
    try {
      requirementStatus.set(entry.id, readItem(store, `requirements/${entry.id}/v${entry.latest}.md`, 'requirement').data.status);
    } catch {
      // A broken artifact is reported by `faro verify`; migration leaves it alone.
    }
  }

  // Bump schema_version on every canonical artifact. Content is untouched.
  for (const relative of canonicalPaths(store)) {
    const raw = readUtf8(storePath(store, relative));
    const { data, body } = readDocument(raw, relative);
    if (data.schema_version === SCHEMA_VERSION) continue;
    apply(`stamped ${relative} as schema v${SCHEMA_VERSION}`, () => {
      writeItem(store, relative, ordered(data.faro_type, { ...data, schema_version: SCHEMA_VERSION }), body);
    });
  }

  // Proposals: derive the semantic-fact contract from structured v1 fields.
  let obligationCounter = 0;
  for (const id of listProposals(store)) {
    const relative = `intake/proposals/${id}.md`;
    const { data, body } = readDocument(readUtf8(storePath(store, relative)), relative);
    if (data.semantic_facts) continue;

    const facts = deriveFacts(data, requirementStatus);
    const changes = [...(data.changes ?? [])];
    const primary = data.classification?.primary;
    let obligationDraft = null;

    if ((primary === 'bug' || primary === 'work_unit') && changes.length === 0) {
      obligationCounter += 1;
      obligationDraft = buildObligationDraft(data, body);
      changes.push({ op: 'create_obligation', draft: 'obligation.md' });
    }

    apply(`migrated ${id} to the semantic-fact contract${obligationDraft ? ' and gave it an obligation draft' : ''}`, () => {
      if (obligationDraft) {
        writeItem(store, `intake/proposals/${id}.draft/obligation.md`, obligationDraft.data, obligationDraft.body);
      }
      const migrated = ordered('proposal', {
        ...data,
        schema_version: SCHEMA_VERSION,
        semantic_facts: facts,
        changes,
        baseline_impact: undefined,
        no_change_reason: undefined,
      });
      writeItem(store, relative, migrated, body);
    });

    // A v1 bug/work_unit that was already applied closed without leaving a record
    // of the work. Recreate the obligation so it stops looking finished.
    if (obligationDraft && data.status === 'applied') {
      apply(`recreated the accepted obligation ${id} lost when it was applied under v1`, () => {
        const obligationId = nextId(store, 'obligation');
        writeItem(
          store,
          `obligations/${obligationId}.md`,
          ordered('obligation', {
            ...obligationDraft.data,
            schema_version: SCHEMA_VERSION,
            id: obligationId,
            status: 'unrouted',
            created_at: data.applied_at ?? now(),
            origin: id,
            intake: data.intake,
          }),
          obligationDraft.body,
        );
      });
    }
  }

  apply('rewrote project.json as identity plus store revision', () => {
    writeProject(store, {
      schemaVersion: SCHEMA_VERSION,
      projectId: project.projectId,
      name: project.name,
      faroVersion: project.faroVersion,
      createdAt: project.createdAt,
      // A v1 store has no transaction history; it starts settled at zero.
      storeRevision: 0,
      lastTransaction: null,
    });
  });

  const gitignore = storePath(store, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    apply('added .faro/.gitignore for transaction staging', () => {
      writeAtomic(gitignore, '# Faro transaction staging — working state, never committed.\n.txn/\n');
    });
  }

  // Stamping `schema_version` changes every file's hash, which would otherwise
  // stale every open proposal and every view. A migration is a mechanical
  // rewrite, not a semantic change, so it repairs the freshness bookkeeping it
  // necessarily disturbed. Reasoning is preserved; only the digests move.
  if (!options.dryRun) {
    for (const id of listProposals(store)) {
      const proposal = readItem(store, `intake/proposals/${id}.md`, 'proposal');
      if (!['draft', 'approved'].includes(proposal.data.status)) continue;
      const bindings = (proposal.data.context_bindings ?? [])
        .filter((binding) => exists(store, binding.path))
        .map((binding) => ({ path: binding.path, hash: hashText(readUtf8(storePath(store, binding.path))) }));
      writeItem(store, `intake/proposals/${id}.md`, ordered('proposal', { ...proposal.data, context_bindings: bindings }), proposal.body);
    }
    renderAllViews(store);
  }
  actions.push('re-bound open proposals and regenerated views against the migrated content');

  return { from, to: SCHEMA_VERSION, actions };
}

/**
 * Every fact comes from a structured v1 field. Where v1 recorded nothing, the
 * fact is false — which is what v1's own approval policy already assumed.
 */
function deriveFacts(proposal, requirementStatus) {
  const changes = proposal.changes ?? [];
  const has = (op) => changes.some((change) => change.op === op);
  const revised = changes.filter((change) => change.op === 'revise_requirement').map((change) => change.target).filter(Boolean);
  const committed = revised.filter((id) => COMMITTED_REQUIREMENT_STATUS.includes(requirementStatus.get(id) ?? ''));
  const baseline = proposal.baseline_impact ?? {};
  const primary = proposal.classification?.primary;
  const decisionTarget = changes.find((change) => change.op === 'revise_decision')?.target ?? null;

  const fact = (value, extra = {}, evidence = []) => ({ value, evidence, ...extra });

  return {
    contract_version: SEMANTIC_FACTS_VERSION,
    project_charter_affected: fact(has('update_charter'), {}, has('update_charter') ? ['charter/charter.md'] : []),
    accepted_requirement_affected: fact(committed.length > 0, { requirements: committed }),
    requirement_superseded: fact(revised.length > 0, { target: revised[0] ?? null }),
    active_baseline_affected: fact(baseline.impacted === true, { baseline: baseline.impacted === true ? baseline.active_baseline ?? null : null }, baseline.impacted === true && baseline.active_baseline ? [`baselines/${baseline.active_baseline}.md`] : []),
    accepted_behavior_changed: fact(primary === 'change_request'),
    decision_revised: fact(has('revise_decision'), { target: decisionTarget }),
    active_obligation_invalidated: fact(false, { obligations: [] }),
    // v1 forced human approval on low confidence; the fact contract expresses the
    // same judgement explicitly rather than through a confidence side effect.
    ambiguity_unresolved: fact(proposal.classification?.confidence === 'low', {}, []),
  };
}

function buildObligationDraft(proposal, body) {
  const summary = section(body, 'Normalized summary');
  return {
    data: {
      faro_type: 'obligation',
      kind: proposal.classification.primary === 'bug' ? 'bug' : 'work_unit',
      title: truncateAtWord(summary.split('\n')[0], 110) || `Obligation from ${proposal.id}`,
      related_requirements: proposal.related?.requirements ?? [],
      related_decisions: proposal.related?.decisions ?? [],
      pending_reason: proposal.no_change_reason ?? 'Faro admits this obligation but cannot route it to execution yet.',
    },
    body: [
      '## Obligation',
      '',
      summary || `Carried forward from ${proposal.id} during the v1 → v2 migration.`,
      '',
      '## Acceptance',
      '',
      'Migrated from a schema v1 proposal that recorded no acceptance boundary of its own.',
      'Review and sharpen this before the obligation is routed to execution.',
    ].join('\n'),
  };
}

/** Machine-derived titles should still read as sentences, not stop mid-word. */
function truncateAtWord(text, limit) {
  const trimmed = (text ?? '').trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
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

function canonicalPaths(store) {
  const paths = [];
  if (exists(store, 'charter/charter.md')) paths.push('charter/charter.md');
  for (const item of listRequirements(store)) for (const v of item.versions) paths.push(`requirements/${item.id}/v${v}.md`);
  for (const item of listDecisions(store)) for (const v of item.versions) paths.push(`decisions/${item.id}/v${v}.md`);
  for (const id of listKnowledge(store)) paths.push(`knowledge/${id}.md`);
  for (const id of listBaselines(store)) paths.push(`baselines/${id}.md`);
  for (const id of listIntakeRecords(store)) paths.push(`intake/records/${id}.md`);
  return paths.filter((relative) => fs.existsSync(storePath(store, relative)) && !relative.includes(`${path.sep}_history`));
}
