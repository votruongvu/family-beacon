/**
 * The canonical Faro model: vocabularies, schemas, required narrative sections,
 * and the deterministic parts of admission policy.
 *
 * This file is the single definition of what a valid Faro artifact is. Commands,
 * skills, and tests all read it, so a schema change lands in exactly one place.
 */
import { s } from './schema.mjs';

export const FARO_VERSION = '0.2.0';
export const SCHEMA_VERSION = 2;

/** The versioned contract that approval policy reads. See `requiredApproval()`. */
export const SEMANTIC_FACTS_VERSION = 1;

/* ---------------------------------------------------------------- identity */

export const ID_PATTERNS = {
  requirement: /^REQ-\d{4}$/,
  decision: /^DEC-\d{4}$/,
  knowledge: /^KNW-\d{4}$/,
  baseline: /^BL-\d{4}$/,
  intake: /^INT-\d{4}$/,
  proposal: /^PROP-\d{4}$/,
  obligation: /^OBL-\d{4}$/,
  signature: /^SIG-\d{4}$/,
  investigation: /^INV-\d{4}$/,
  route: /^ROUTE-\d{4}$/,
};

export const ID_PREFIXES = {
  requirement: 'REQ',
  decision: 'DEC',
  knowledge: 'KNW',
  baseline: 'BL',
  intake: 'INT',
  proposal: 'PROP',
  obligation: 'OBL',
  signature: 'SIG',
  investigation: 'INV',
  route: 'ROUTE',
};

/** Charter element identifiers. Short because a charter stays small on purpose. */
export const CHARTER_ID_PATTERNS = {
  objective: /^OBJ-\d{2}$/,
  delivery: /^DEL-\d{2}$/,
  milestone: /^MS-\d{2}$/,
  principle: /^PRN-\d{2}$/,
  successMeasure: /^SM-\d{2}$/,
  stakeholder: /^STK-\d{2}$/,
};

/** A pinned requirement version, e.g. REQ-0041@2. Baselines reference these. */
export const VERSION_REF = /^REQ-\d{4}@\d+$/;

export const TRANSACTION_ID = /^TXN-\d{4}$/;

/* ------------------------------------------------------------ vocabularies */

/**
 * One confidence vocabulary for the whole system. Laputa Studio and Laputa
 * Factory each carried their own; the extraction asked for a single small set.
 */
export const KNOWLEDGE_STATUS = ['confirmed', 'inferred', 'assumed', 'unknown', 'conflicting'];

export const REQUIREMENT_STATUS = [
  'captured',
  'analyzed',
  'admitted',
  'baselined',
  'implementing',
  'verified',
  'accepted',
  'deferred',
  'rejected',
  'superseded',
  'obsolete',
];

/** Requirement states that represent a commitment somebody is relying on. */
export const COMMITTED_REQUIREMENT_STATUS = ['baselined', 'implementing', 'verified', 'accepted'];

export const DECISION_STATUS = ['proposed', 'accepted', 'superseded', 'rejected'];
export const BASELINE_STATUS = ['draft', 'active', 'superseded'];
export const CONFIDENCE = ['high', 'medium', 'low'];

/**
 * Proposal lifecycle.
 *
 * `superseded` exists only for a proposal that a rebase replaced — the original
 * stays on disk as evidence of what was reasoned before the sources moved.
 */
export const PROPOSAL_STATUS = ['draft', 'approved', 'applied', 'rejected', 'superseded'];

/** Obligation lifecycle. `unrouted` is the only state admission can produce. */
export const OBLIGATION_STATUS = ['unrouted', 'fulfilled', 'withdrawn'];
export const OBLIGATION_KIND = ['bug', 'work_unit'];

/** The eight primary intake classifications Faro admits today. */
export const CLASSIFICATIONS = [
  'project_charter_change',
  'project_knowledge',
  'new_requirement',
  'requirement_revision',
  'decision',
  'bug',
  'change_request',
  'work_unit',
];

/** Relation types. Only those a current command actually reads are defined. */
export const RELATION_TYPES = ['depends_on', 'refines', 'supersedes', 'derived_from', 'conflicts_with', 'affects'];

/** Change operations `faro apply` knows how to perform. */
export const CHANGE_OPS = [
  'create_requirement',
  'revise_requirement',
  'create_decision',
  'revise_decision',
  'create_knowledge',
  'update_knowledge',
  'update_charter',
  'create_obligation',
];

/**
 * Which canonical layer each classification is allowed to write.
 *
 * `bug` and `work_unit` write an obligation: admission accepts the work, and the
 * obligation stays open until execution routing can fulfil it. Neither may touch
 * a requirement, because neither changes what the project is obliged to deliver.
 */
export const CLASSIFICATION_OPS = {
  project_charter_change: ['update_charter', 'create_knowledge', 'update_knowledge'],
  project_knowledge: ['create_knowledge', 'update_knowledge'],
  new_requirement: ['create_requirement', 'create_knowledge', 'update_knowledge', 'create_decision'],
  requirement_revision: ['revise_requirement', 'create_knowledge', 'update_knowledge', 'create_decision'],
  decision: ['create_decision', 'revise_decision', 'create_knowledge', 'update_knowledge'],
  bug: ['create_obligation', 'create_knowledge', 'update_knowledge'],
  change_request: ['revise_requirement', 'revise_decision', 'create_knowledge', 'update_knowledge'],
  work_unit: ['create_obligation', 'create_knowledge', 'update_knowledge'],
};

/**
 * Classifications that always need a named human before anything is written.
 * Everything else is decided by the semantic facts. See `requiredApproval()`.
 */
export const ALWAYS_HUMAN = ['project_charter_change', 'change_request'];

/* -------------------------------------------------------- narrative shape */

/** Required `## ` headings in each artifact body, in order. */
export const REQUIRED_SECTIONS = {
  charter: ['Vision', 'Problem'],
  requirement: ['Desired outcome', 'Scope', 'Acceptance criteria'],
  decision: ['Context', 'Decision', 'Consequences'],
  knowledge: ['Fact'],
  baseline: ['Intent'],
  obligation: ['Obligation', 'Acceptance'],
  intake: ['Original input'],
  proposal: ['Normalized summary', 'Reasoning'],
  signature: ['Compilation notes'],
  investigation: ['Approach'],
  route: ['Routing summary', 'Reasoning'],
};

/* ------------------------------------------------------------------ schemas */

const provenance = s.object(
  {
    kind: s.enum(['user-stated', 'document', 'repository', 'observation', 'external']),
    source: s.string(),
    captured_at: s.string(),
  },
  ['kind', 'source'],
);

const relation = s.object(
  {
    type: s.enum(RELATION_TYPES),
    target: s.string(),
    reason: s.string(),
  },
  ['type', 'target', 'reason'],
);

const binding = s.object(
  {
    path: s.string(),
    hash: s.string({ pattern: /^[a-f0-9]{64}$/ }),
  },
  ['path', 'hash'],
);

/**
 * One semantic fact: an assertion Claude makes, with the evidence a human would
 * need to check it. `value` is what policy reads; `evidence` is what makes the
 * assertion reviewable.
 */
const fact = (extra = {}) =>
  s.object({ value: s.boolean(), evidence: s.list(s.string()), explanation: s.string({ nullable: true }), ...extra }, ['value']);

export const charterSchema = s.object(
  {
    faro_type: s.enum(['charter']),
    schema_version: s.integer({ min: 1 }),
    charter_version: s.integer({ min: 1 }),
    status: s.enum(['draft', 'active']),
    updated_at: s.string(),
    origin: s.string({ nullable: true }),
    objectives: s.list(
      s.object({ id: s.string({ pattern: CHARTER_ID_PATTERNS.objective }), title: s.string(), statement: s.string() }, [
        'id',
        'title',
        'statement',
      ]),
    ),
    deliveries: s.list(
      s.object({ id: s.string({ pattern: CHARTER_ID_PATTERNS.delivery }), title: s.string(), description: s.string() }, [
        'id',
        'title',
        'description',
      ]),
    ),
    milestones: s.list(
      s.object({ id: s.string({ pattern: CHARTER_ID_PATTERNS.milestone }), title: s.string(), outcome: s.string() }, [
        'id',
        'title',
        'outcome',
      ]),
    ),
    scope: s.object({ included: s.list(s.string()), excluded: s.list(s.string()) }, ['included', 'excluded']),
    principles: s.list(
      s.object(
        {
          id: s.string({ pattern: CHARTER_ID_PATTERNS.principle }),
          kind: s.enum(['delivery', 'architecture']),
          statement: s.string(),
        },
        ['id', 'kind', 'statement'],
      ),
    ),
    success_measures: s.list(
      s.object({ id: s.string({ pattern: CHARTER_ID_PATTERNS.successMeasure }), statement: s.string() }, [
        'id',
        'statement',
      ]),
    ),
    stakeholders: s.list(
      s.object(
        {
          id: s.string({ pattern: CHARTER_ID_PATTERNS.stakeholder }),
          name: s.string(),
          role: s.string(),
          decision_authority: s.list(s.string()),
        },
        ['id', 'name', 'role', 'decision_authority'],
      ),
    ),
  },
  [
    'faro_type',
    'schema_version',
    'charter_version',
    'status',
    'updated_at',
    'objectives',
    'deliveries',
    'milestones',
    'scope',
    'principles',
    'success_measures',
    'stakeholders',
  ],
);

export const requirementSchema = s.object(
  {
    faro_type: s.enum(['requirement']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.requirement }),
    version: s.integer({ min: 1 }),
    status: s.enum(REQUIREMENT_STATUS),
    title: s.string(),
    intent: s.string(),
    created_at: s.string(),
    origin: s.string({ nullable: true }),
    revision_of: s.string({ pattern: VERSION_REF, nullable: true }),
    revision_reason: s.string({ nullable: true }),
    supersedes: s.list(s.string({ pattern: VERSION_REF })),
    aligns_to_objectives: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.objective })),
    contributes_to_deliveries: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.delivery })),
    targets_milestones: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.milestone })),
    relations: s.list(relation),
  },
  ['faro_type', 'schema_version', 'id', 'version', 'status', 'title', 'intent', 'created_at'],
);

export const decisionSchema = s.object(
  {
    faro_type: s.enum(['decision']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.decision }),
    version: s.integer({ min: 1 }),
    status: s.enum(DECISION_STATUS),
    title: s.string(),
    statement: s.string(),
    high_impact: s.boolean(),
    created_at: s.string(),
    origin: s.string({ nullable: true }),
    revision_of: s.string({ nullable: true }),
    supersedes: s.list(s.string()),
    constrains: s.list(s.string()),
    relations: s.list(relation),
  },
  ['faro_type', 'schema_version', 'id', 'version', 'status', 'title', 'statement', 'created_at'],
);

export const knowledgeSchema = s.object(
  {
    faro_type: s.enum(['knowledge']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.knowledge }),
    status: s.enum(KNOWLEDGE_STATUS),
    title: s.string(),
    created_at: s.string(),
    updated_at: s.string({ nullable: true }),
    origin: s.string({ nullable: true }),
    provenance: s.list(provenance, { min: 1 }),
    relates_to: s.list(s.string()),
  },
  ['faro_type', 'schema_version', 'id', 'status', 'title', 'created_at', 'provenance'],
);

export const baselineSchema = s.object(
  {
    faro_type: s.enum(['baseline']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.baseline }),
    status: s.enum(BASELINE_STATUS),
    title: s.string(),
    target: s.string(),
    created_at: s.string(),
    approved_by: s.string({ nullable: true }),
    approved_at: s.string({ nullable: true }),
    supersedes: s.string({ pattern: ID_PATTERNS.baseline, nullable: true }),
    requirements: s.list(s.string({ pattern: VERSION_REF })),
  },
  ['faro_type', 'schema_version', 'id', 'status', 'title', 'target', 'created_at', 'requirements'],
);

/**
 * An accepted obligation that admission cannot yet fulfil.
 *
 * A bug or a work unit is real work the project has taken on, but Faro stops at
 * admission — there is no execution routing to hand it to. Closing the proposal
 * without this record would make the project look finished when the work has
 * only been acknowledged.
 */
export const obligationSchema = s.object(
  {
    faro_type: s.enum(['obligation']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.obligation }),
    kind: s.enum(OBLIGATION_KIND),
    status: s.enum(OBLIGATION_STATUS),
    title: s.string(),
    created_at: s.string(),
    origin: s.string({ pattern: ID_PATTERNS.proposal }),
    intake: s.string({ pattern: ID_PATTERNS.intake }),
    related_requirements: s.list(s.string()),
    related_decisions: s.list(s.string({ pattern: ID_PATTERNS.decision })),
    pending_reason: s.string(),
    closed_at: s.string({ nullable: true }),
    closure_reason: s.string({ nullable: true }),
  },
  ['faro_type', 'schema_version', 'id', 'kind', 'status', 'title', 'created_at', 'origin', 'intake', 'pending_reason'],
);

export const intakeSchema = s.object(
  {
    faro_type: s.enum(['intake']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.intake }),
    captured_at: s.string(),
    captured_by: s.string(),
    source: s.enum(['user', 'meeting-note', 'document', 'defect-report', 'repository', 'external']),
    proposal: s.string({ pattern: ID_PATTERNS.proposal, nullable: true }),
  },
  ['faro_type', 'schema_version', 'id', 'captured_at', 'captured_by', 'source'],
);

/**
 * The versioned semantic-fact contract.
 *
 * These assertions — and only these — decide the approval level. The toolkit
 * never reads narrative prose to judge severity, so wording cannot change what a
 * proposal is allowed to do.
 */
export const semanticFactsSchema = s.object(
  {
    contract_version: s.integer({ min: 1 }),
    project_charter_affected: fact(),
    accepted_requirement_affected: fact({ requirements: s.list(s.string()) }),
    requirement_superseded: fact({ target: s.string({ pattern: /^REQ-\d{4}(@\d+)?$/, nullable: true }) }),
    active_baseline_affected: fact({ baseline: s.string({ pattern: ID_PATTERNS.baseline, nullable: true }) }),
    accepted_behavior_changed: fact(),
    decision_revised: fact({ target: s.string({ pattern: ID_PATTERNS.decision, nullable: true }) }),
    active_obligation_invalidated: fact({ obligations: s.list(s.string({ pattern: ID_PATTERNS.obligation })) }),
    ambiguity_unresolved: fact(),
  },
  [
    'contract_version',
    'project_charter_affected',
    'accepted_requirement_affected',
    'requirement_superseded',
    'active_baseline_affected',
    'accepted_behavior_changed',
    'decision_revised',
    'active_obligation_invalidated',
    'ambiguity_unresolved',
  ],
);

/** Lineage a rebased proposal carries so its ancestry is never guessed. */
export const rebaseSchema = s.object(
  {
    rebased_from: s.string({ pattern: ID_PATTERNS.proposal }),
    rebased_at: s.string(),
    changed_bindings: s.list(s.string(), { min: 1 }),
    previous_classification: s.enum(CLASSIFICATIONS),
    previous_impact_summary: s.string(),
    reconsidered: s.boolean(),
    reconsidered_at: s.string({ nullable: true }),
    classification_changed: s.boolean({ nullable: true }),
    mutation_set_changed: s.boolean({ nullable: true }),
  },
  ['rebased_from', 'rebased_at', 'changed_bindings', 'previous_classification', 'previous_impact_summary', 'reconsidered'],
);

export const proposalSchema = s.object(
  {
    faro_type: s.enum(['proposal']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.proposal }),
    intake: s.string({ pattern: ID_PATTERNS.intake }),
    status: s.enum(PROPOSAL_STATUS),
    created_at: s.string(),
    classification: s.object(
      {
        primary: s.enum(CLASSIFICATIONS),
        supporting: s.list(s.enum(CLASSIFICATIONS)),
        confidence: s.enum(CONFIDENCE),
      },
      ['primary', 'confidence'],
    ),
    semantic_facts: semanticFactsSchema,
    related: s.object(
      {
        requirements: s.list(s.string()),
        decisions: s.list(s.string()),
        knowledge: s.list(s.string()),
      },
      [],
    ),
    alignment: s.object(
      {
        objectives: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.objective })),
        deliveries: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.delivery })),
        milestones: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.milestone })),
      },
      [],
    ),
    repository_probe: s.object({ required: s.boolean(), reason: s.string() }, ['required', 'reason']),
    approval: s.object(
      {
        required: s.enum(['none', 'human']),
        granted: s.boolean(),
        granted_by: s.string({ nullable: true }),
        granted_at: s.string({ nullable: true }),
      },
      ['required', 'granted'],
    ),
    changes: s.list(
      s.object(
        {
          op: s.enum(CHANGE_OPS),
          draft: s.string(),
          target: s.string({ nullable: true }),
        },
        ['op', 'draft'],
      ),
      { min: 1 },
    ),
    not_affected: s.list(s.string(), { min: 1 }),
    ambiguities: s.list(s.string()),
    next_action: s.string(),
    context_bindings: s.list(binding, { min: 1 }),
    rebase: rebaseSchema,
    superseded_by: s.string({ pattern: ID_PATTERNS.proposal, nullable: true }),
    applied_at: s.string({ nullable: true }),
    applied_changes: s.list(s.string()),
    applied_transaction: s.string({ pattern: TRANSACTION_ID, nullable: true }),
    rejected_at: s.string({ nullable: true }),
    rejection_reason: s.string({ nullable: true }),
  },
  [
    'faro_type',
    'schema_version',
    'id',
    'intake',
    'status',
    'created_at',
    'classification',
    'semantic_facts',
    'repository_probe',
    'approval',
    'changes',
    'not_affected',
    'next_action',
    'context_bindings',
  ],
);

/**
 * Project identity and store integrity — nothing else.
 *
 * Counts, statuses, and summaries are derived and belong to `faro inspect`.
 * `storeRevision` advances only when a transaction commits, and no proposal may
 * bind to this file, so a revision bump never expires anyone's reasoning.
 */
export const projectSchema = s.object(
  {
    schemaVersion: s.integer({ min: 1 }),
    projectId: s.string({ pattern: /^[a-z0-9][a-z0-9-]*$/ }),
    name: s.string(),
    faroVersion: s.string(),
    createdAt: s.string(),
    storeRevision: s.integer({ min: 0 }),
    lastTransaction: s.string({ pattern: TRANSACTION_ID, nullable: true }),
  },
  ['schemaVersion', 'projectId', 'name', 'faroVersion', 'createdAt', 'storeRevision'],
);

export const viewSchema = s.object(
  {
    faro_type: s.enum(['view']),
    generated: s.boolean(),
    generator: s.string(),
    generated_at: s.string(),
    source_bindings: s.list(binding),
  },
  ['faro_type', 'generated', 'generator', 'generated_at', 'source_bindings'],
);

/** The record that makes a partially committed transaction recoverable. */
export const transactionSchema = s.object(
  {
    id: s.string({ pattern: TRANSACTION_ID }),
    proposal: s.string({ pattern: ID_PATTERNS.proposal }),
    status: s.enum(['staging', 'committing', 'committed']),
    started_at: s.string(),
    committed_at: s.string({ nullable: true }),
    store_revision_before: s.integer({ min: 0 }),
    mutations: s.list(
      s.object(
        {
          path: s.string(),
          before: s.string({ nullable: true }),
          after: s.string({ pattern: /^[a-f0-9]{64}$/ }),
        },
        ['path', 'after'],
      ),
      { min: 1 },
    ),
  },
  ['id', 'proposal', 'status', 'started_at', 'store_revision_before', 'mutations'],
);

/* ------------------------------------------------------------ file layout */

/**
 * On-disk front-matter key order per artifact type.
 *
 * Byte-stable output matters: proposals and views bind to file hashes, so an
 * incidental key reordering would look like a material change.
 */
export const FIELD_ORDER = {
  charter: [
    'faro_type',
    'schema_version',
    'charter_version',
    'status',
    'updated_at',
    'origin',
    'objectives',
    'deliveries',
    'milestones',
    'scope',
    'principles',
    'success_measures',
    'stakeholders',
  ],
  requirement: [
    'faro_type',
    'schema_version',
    'id',
    'version',
    'status',
    'title',
    'intent',
    'created_at',
    'origin',
    'revision_of',
    'revision_reason',
    'supersedes',
    'aligns_to_objectives',
    'contributes_to_deliveries',
    'targets_milestones',
    'relations',
  ],
  decision: [
    'faro_type',
    'schema_version',
    'id',
    'version',
    'status',
    'title',
    'statement',
    'high_impact',
    'created_at',
    'origin',
    'revision_of',
    'supersedes',
    'constrains',
    'relations',
  ],
  knowledge: [
    'faro_type',
    'schema_version',
    'id',
    'status',
    'title',
    'created_at',
    'updated_at',
    'origin',
    'provenance',
    'relates_to',
  ],
  baseline: [
    'faro_type',
    'schema_version',
    'id',
    'status',
    'title',
    'target',
    'created_at',
    'approved_by',
    'approved_at',
    'supersedes',
    'requirements',
  ],
  obligation: [
    'faro_type',
    'schema_version',
    'id',
    'kind',
    'status',
    'title',
    'created_at',
    'origin',
    'intake',
    'related_requirements',
    'related_decisions',
    'pending_reason',
    'closed_at',
    'closure_reason',
  ],
  intake: ['faro_type', 'schema_version', 'id', 'captured_at', 'captured_by', 'source', 'proposal'],
  proposal: [
    'faro_type',
    'schema_version',
    'id',
    'intake',
    'status',
    'created_at',
    'classification',
    'semantic_facts',
    'related',
    'alignment',
    'repository_probe',
    'approval',
    'changes',
    'not_affected',
    'ambiguities',
    'next_action',
    'context_bindings',
    'rebase',
    'superseded_by',
    'applied_at',
    'applied_changes',
    'applied_transaction',
    'rejected_at',
    'rejection_reason',
  ],
  signature: [
    'faro_type',
    'schema_version',
    'id',
    'status',
    'created_at',
    'source',
    'intent',
    'alignment',
    'constraints',
    'acceptance_topics',
    'cross_cutting_concerns',
    'risk_characteristics',
    'routing_hints',
    'explicit_exclusions',
    'ambiguities',
    'superseded_by',
    'context_bindings',
  ],
  investigation: [
    'faro_type',
    'schema_version',
    'id',
    'signature',
    'status',
    'created_at',
    'repository_roots',
    'hypotheses',
    'candidate_surfaces',
    'rejected_candidates',
    'expansions',
    'unresolved',
    'confidence',
    'context_bindings',
    'probes',
  ],
  route: [
    'faro_type',
    'schema_version',
    'id',
    'signature',
    'investigation',
    'status',
    'created_at',
    'routing_confidence',
    'context',
    'repositories',
    'scope',
    'contracts',
    'execution_boundary',
    'verification',
    'working_tree',
    'route_facts',
    'ambiguities',
    'stop_conditions',
    'approval',
    'rebase',
    'superseded_by',
    'rejected_at',
    'rejection_reason',
    'context_bindings',
    'repository_bindings',
  ],
};

/**
 * Reorder an artifact's fields for writing. Unknown keys are appended so a
 * schema violation surfaces in `faro verify` rather than being silently dropped.
 * @param {keyof FIELD_ORDER} type
 * @param {Record<string, any>} data
 */
export function ordered(type, data) {
  const order = FIELD_ORDER[type] ?? [];
  const out = {};
  for (const key of order) if (data[key] !== undefined && data[key] !== null) out[key] = data[key];
  for (const key of Object.keys(data)) if (!(key in out) && data[key] !== undefined && data[key] !== null) out[key] = data[key];
  return out;
}

/**
 * Fields `faro apply` assigns. A draft that sets one is rejected outright rather
 * than merged, so identity cannot collide and lineage cannot be forged.
 */
export const ASSIGNED_FIELDS = ['id', 'version', 'created_at', 'updated_at', 'origin', 'revision_of', 'charter_version'];

/** No proposal may bind to these — they change on every commit and mean nothing semantically. */
export const UNBINDABLE_PATHS = ['project.json'];

/* ------------------------------------------------------------------ policy */

/**
 * Which semantic fact forces a named human, and why.
 *
 * This table *is* the policy. Adding a trigger means adding a fact to the
 * contract — there is no path by which prose reaches this decision.
 */
export const APPROVAL_TRIGGERS = {
  project_charter_affected: 'the proposal changes the Project Charter',
  accepted_requirement_affected: 'the proposal affects a requirement somebody is already relying on',
  requirement_superseded: 'the proposal supersedes a requirement version',
  active_baseline_affected: 'the proposal amends an active baseline',
  accepted_behavior_changed: 'the proposal changes accepted behaviour',
  decision_revised: 'the proposal revises a decision',
  active_obligation_invalidated: 'the proposal invalidates an accepted obligation',
  ambiguity_unresolved: 'the proposal leaves an ambiguity unresolved',
};

/**
 * Decide whether a proposal needs a named human before anything is written.
 *
 * Pure function of the proposal's structured facts and classification. It never
 * reads the body, a title, or any free text — wording cannot buy a lower gate.
 *
 * @param {Record<string, any>} proposal parsed proposal front matter
 * @returns {{ level: 'none' | 'human', reasons: string[] }}
 */
export function requiredApproval(proposal) {
  const reasons = [];
  const primary = proposal?.classification?.primary;
  const facts = proposal?.semantic_facts ?? {};

  if (ALWAYS_HUMAN.includes(primary)) {
    reasons.push(`classification "${primary}" always requires human approval`);
  }
  for (const [name, reason] of Object.entries(APPROVAL_TRIGGERS)) {
    if (facts[name]?.value === true) reasons.push(reason);
  }
  if (proposal?.classification?.confidence === 'low') {
    reasons.push('classification confidence is low');
  }
  return { level: reasons.length > 0 ? 'human' : 'none', reasons };
}

/**
 * Cross-check the asserted facts against the mutation set and the store.
 *
 * Claude asserts; the toolkit refuses assertions that contradict what the
 * proposal actually does. This is what stops a proposal from claiming a low
 * approval level by simply declaring its facts benign.
 *
 * @param {Record<string, any>} proposal
 * @param {{ requirementStatus: (id: string) => string | undefined,
 *           baselineStatus: (id: string) => string | undefined,
 *           obligationStatus: (id: string) => string | undefined }} lookups
 * @returns {{path: string, message: string}[]}
 */
export function validateSemanticFacts(proposal, lookups) {
  const issues = [];
  const facts = proposal?.semantic_facts;
  const primary = proposal?.classification?.primary;
  const changes = proposal?.changes ?? [];
  const bound = new Set((proposal?.context_bindings ?? []).map((entry) => entry.path));
  const add = (path, message) => issues.push({ path: `semantic_facts.${path}`, message });

  if (!facts) return [{ path: 'semantic_facts', message: 'is required but missing' }];
  if (facts.contract_version !== SEMANTIC_FACTS_VERSION) {
    add('contract_version', `must be ${SEMANTIC_FACTS_VERSION}; this project speaks contract v${SEMANTIC_FACTS_VERSION}`);
  }

  // Every asserted fact must be checkable, and its evidence must be bound — so a
  // fact whose evidence moves makes the proposal stale rather than quietly wrong.
  for (const name of Object.keys(APPROVAL_TRIGGERS)) {
    const entry = facts[name];
    if (entry?.value !== true) continue;
    const evidence = entry.evidence ?? [];
    if (evidence.length === 0 && !entry.explanation) {
      add(name, 'is asserted true but carries no evidence or explanation a human could check');
    }
    for (const item of evidence) {
      if (item.includes('/') && !bound.has(item)) {
        add(name, `cites ${item} as evidence, which is not in context_bindings`);
      }
    }
  }

  const has = (op) => changes.some((change) => change.op === op);
  const targets = (op) => changes.filter((change) => change.op === op).map((change) => change.target).filter(Boolean);

  // Charter
  if (facts.project_charter_affected?.value === true && !has('update_charter')) {
    add('project_charter_affected', 'is true but no change updates the charter');
  }
  if (has('update_charter') && facts.project_charter_affected?.value !== true) {
    add('project_charter_affected', 'must be true because a change updates the charter');
  }

  // Requirement supersession — any revision supersedes the version it replaces.
  if (has('revise_requirement') && facts.requirement_superseded?.value !== true) {
    add('requirement_superseded', 'must be true because a change revises a requirement');
  }
  if (facts.requirement_superseded?.value === true && !facts.requirement_superseded.target) {
    add('requirement_superseded', 'is true but names no target requirement');
  }

  // Committed requirements are derived from the store, not taken on trust.
  const committed = targets('revise_requirement').filter((id) => COMMITTED_REQUIREMENT_STATUS.includes(lookups.requirementStatus(id) ?? ''));
  if (committed.length > 0 && facts.accepted_requirement_affected?.value !== true) {
    add('accepted_requirement_affected', `must be true because ${committed.join(', ')} is already committed`);
  }

  // Decisions
  if (has('revise_decision') && facts.decision_revised?.value !== true) {
    add('decision_revised', 'must be true because a change revises a decision');
  }
  if (facts.decision_revised?.value === true && !facts.decision_revised.target) {
    add('decision_revised', 'is true but names no target decision');
  }

  // Baselines
  const baseline = facts.active_baseline_affected;
  if (baseline?.value === true) {
    if (!baseline.baseline) {
      add('active_baseline_affected', 'is true but does not identify the baseline');
    } else if (lookups.baselineStatus(baseline.baseline) === undefined) {
      add('active_baseline_affected', `names ${baseline.baseline}, which does not exist`);
    } else if (lookups.baselineStatus(baseline.baseline) !== 'active') {
      add('active_baseline_affected', `names ${baseline.baseline}, which is ${lookups.baselineStatus(baseline.baseline)}, not active`);
    }
  }

  // Obligations
  for (const id of facts.active_obligation_invalidated?.obligations ?? []) {
    if (lookups.obligationStatus(id) === undefined) {
      add('active_obligation_invalidated', `names ${id}, which does not exist`);
    }
  }
  if (facts.active_obligation_invalidated?.value === true && (facts.active_obligation_invalidated.obligations ?? []).length === 0) {
    add('active_obligation_invalidated', 'is true but names no obligation');
  }

  // Accepted behaviour is the defining fact of a change request, both ways round.
  if (facts.accepted_behavior_changed?.value === true && !['change_request', 'requirement_revision'].includes(primary)) {
    add('accepted_behavior_changed', `cannot be true for classification "${primary}" — changing accepted behaviour is a change request`);
  }
  if (primary === 'change_request' && facts.accepted_behavior_changed?.value !== true) {
    add('accepted_behavior_changed', 'must be true for a change request; if no accepted behaviour changes, this is not a change request');
  }
  if (primary === 'project_charter_change' && facts.project_charter_affected?.value !== true) {
    add('project_charter_affected', 'must be true for a project charter change');
  }

  return issues;
}

/* ================================================================= routing */

/**
 * Repository-grounded routing.
 *
 * Three artifacts, in order, each bound to the exact thing it was derived from:
 *
 *   Signature      what one admitted item means in execution terms — Claude's
 *                  compilation of an immutable source version
 *   Investigation  how the repository was probed, narrow to wide, and what each
 *                  probe actually found — deterministic evidence
 *   Route          the resulting execution boundary: context, scopes, isolation,
 *                  verification obligations, confidence, stop conditions
 *
 * Routing is read-only with respect to both the registries and the repository.
 * It ends at an approved contract; nothing here executes anything.
 */

/** The versioned contract route approval policy reads. See `requiredRouteApproval()`. */
export const ROUTE_FACTS_VERSION = 1;

export const SIGNATURE_SOURCE_TYPES = ['requirement', 'obligation'];

export const INTENT_TYPES = [
  'capability',
  'integration',
  'correction',
  'constraint',
  'compatibility',
  'documentation',
  'migration',
];

export const RISK_LEVELS = ['low', 'medium', 'high'];
export const ROUTING_CONFIDENCE = ['high', 'medium', 'low'];

/**
 * Persisted route lifecycle.
 *
 * There is deliberately no `stale` status. Staleness is computed from bindings at
 * read time, exactly as it is for proposals and views — a flag that must be
 * flipped is a flag that rots. `faro inspect` reports staleness as a derived
 * state; nothing writes it.
 */
export const ROUTE_STATUS = ['draft', 'review_required', 'approved', 'superseded', 'rejected'];

/** Overall isolation level. The dimensions below refine it. */
export const ISOLATION_LEVELS = ['context', 'branch', 'worktree', 'disposable_environment', 'critical'];
export const SOURCE_ISOLATION = ['none', 'branch', 'worktree', 'clone'];
export const RUNTIME_ISOLATION = ['none', 'local_process', 'container', 'dedicated_environment'];
export const DATA_SCOPE = ['none', 'fixtures', 'disposable_database', 'dedicated_dataset'];
export const EXTERNAL_SYSTEM_MODE = ['none', 'mock', 'sandbox', 'dedicated_stage'];
export const CREDENTIAL_SCOPE = ['none', 'local_dev', 'sandbox', 'dedicated_service_account'];

export const REPOSITORY_ROLES = ['primary', 'supporting', 'reference', 'excluded'];

/**
 * Verification obligations are one list with a `kind`, not five parallel lists.
 * Five lists answering "what must later execution prove?" would be five names for
 * one question — the projection-multiplication Faro rejects everywhere else.
 */
export const VERIFICATION_KINDS = [
  'unit',
  'contract',
  'integration',
  'migration',
  'negative_probe',
  'idempotency',
  'api_compatibility',
  'security_challenge',
  'credential_boundary',
  'provenance',
  'documentation',
];

/** Deterministic probes. Each is read-only and returns a normalized result. */
export const PROBE_TYPES = [
  'repository_discovery',
  'identifier_search',
  'contract_search',
  'implementation_search',
  'reference_search',
  'registration_search',
  'test_discovery',
  'migration_discovery',
  'configuration_discovery',
  'consumer_search',
  'manifest_inspection',
  'working_tree_status',
];

const riskCharacteristics = s.object(
  {
    blast_radius: s.enum(RISK_LEVELS),
    uncertainty: s.enum(RISK_LEVELS),
    irreversibility: s.enum(RISK_LEVELS),
    data_sensitivity: s.enum(RISK_LEVELS),
    external_dependency: s.enum(RISK_LEVELS),
    statefulness: s.enum(RISK_LEVELS),
  },
  ['blast_radius', 'uncertainty', 'irreversibility', 'data_sensitivity', 'external_dependency', 'statefulness'],
);

/** A file or directory inside one registered repository, with why it is in scope. */
const scopeEntry = s.object(
  {
    repository: s.string(),
    path: s.string(),
    reason: s.string(),
    confidence: s.enum(ROUTING_CONFIDENCE, { nullable: true }),
  },
  ['repository', 'path', 'reason'],
);

/** A binding to a file inside a repository, so a route expires when code moves. */
const repositoryBinding = s.object(
  {
    repository: s.string(),
    path: s.string(),
    hash: s.string({ pattern: /^[a-f0-9]{64}$/ }),
  },
  ['repository', 'path', 'hash'],
);

const contextBinding = s.object(
  { path: s.string(), reason: s.string() },
  ['path', 'reason'],
);

export const signatureSchema = s.object(
  {
    faro_type: s.enum(['signature']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.signature }),
    status: s.enum(['current', 'superseded']),
    created_at: s.string(),
    source: s.object(
      {
        type: s.enum(SIGNATURE_SOURCE_TYPES),
        id: s.string(),
        version: s.integer({ min: 1, nullable: true }),
        path: s.string(),
        content_hash: s.string({ pattern: /^[a-f0-9]{64}$/ }),
      },
      ['type', 'id', 'path', 'content_hash'],
    ),
    intent: s.object(
      {
        type: s.enum(INTENT_TYPES),
        outcome: s.string(),
        actors: s.list(s.string()),
        capability_topics: s.list(s.string(), { min: 1 }),
      },
      ['type', 'outcome', 'capability_topics'],
    ),
    alignment: s.object(
      {
        objectives: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.objective })),
        deliveries: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.delivery })),
        milestones: s.list(s.string({ pattern: CHARTER_ID_PATTERNS.milestone })),
      },
      [],
    ),
    constraints: s.object(
      { mandatory: s.list(s.string()), prohibited_assumptions: s.list(s.string()) },
      ['mandatory', 'prohibited_assumptions'],
    ),
    acceptance_topics: s.list(s.string(), { min: 1 }),
    cross_cutting_concerns: s.list(s.string()),
    risk_characteristics: riskCharacteristics,
    routing_hints: s.object(
      {
        known_analogues: s.list(s.string()),
        expected_contracts: s.list(s.string()),
        expected_tests: s.list(s.string()),
        likely_repositories: s.list(s.string()),
      },
      [],
    ),
    explicit_exclusions: s.list(s.string(), { min: 1 }),
    ambiguities: s.list(s.string()),
    superseded_by: s.string({ pattern: ID_PATTERNS.signature, nullable: true }),
    context_bindings: s.list(binding, { min: 1 }),
  },
  [
    'faro_type',
    'schema_version',
    'id',
    'status',
    'created_at',
    'source',
    'intent',
    'constraints',
    'acceptance_topics',
    'risk_characteristics',
    'explicit_exclusions',
    'context_bindings',
  ],
);

/** One recorded probe. Written by the toolkit; Claude chooses which to run. */
const probeRecord = s.object(
  {
    probe_id: s.string({ pattern: /^P-\d{3}$/ }),
    type: s.enum(PROBE_TYPES),
    repository: s.string(),
    repository_root: s.string(),
    query: s.string({ nullable: true }),
    mechanism: s.string(),
    match_count: s.integer({ min: 0 }),
    matches: s.list(
      s.object(
        {
          path: s.string(),
          hash: s.string({ pattern: /^[a-f0-9]{64}$/, nullable: true }),
          lines: s.list(s.integer({ min: 1 })),
          note: s.string({ nullable: true }),
          secret_suspected: s.boolean({ nullable: true }),
        },
        ['path'],
      ),
    ),
    revision: s.string({ nullable: true }),
    limitations: s.list(s.string()),
    errors: s.list(s.string()),
    executed_at: s.string(),
    detail: s.any(),
  },
  ['probe_id', 'type', 'repository', 'repository_root', 'mechanism', 'match_count', 'matches', 'executed_at'],
);

export const investigationSchema = s.object(
  {
    faro_type: s.enum(['investigation']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.investigation }),
    signature: s.string({ pattern: ID_PATTERNS.signature }),
    status: s.enum(['open', 'closed']),
    created_at: s.string(),
    repository_roots: s.list(s.string(), { min: 1 }),
    hypotheses: s.list(
      s.object({ id: s.string(), statement: s.string(), basis: s.string() }, ['id', 'statement', 'basis']),
      { min: 1 },
    ),
    probes: s.list(probeRecord),
    candidate_surfaces: s.list(
      s.object(
        { repository: s.string(), path: s.string(), role: s.string(), evidence: s.list(s.string(), { min: 1 }) },
        ['repository', 'path', 'role', 'evidence'],
      ),
    ),
    rejected_candidates: s.list(
      s.object({ repository: s.string(), path: s.string(), reason: s.string() }, ['repository', 'path', 'reason']),
    ),
    expansions: s.list(
      s.object(
        {
          hop: s.integer({ min: 1 }),
          from: s.string(),
          to: s.string(),
          justification: s.string(),
          evidence: s.list(s.string(), { min: 1 }),
          beyond_initial_hypothesis: s.boolean(),
        },
        ['hop', 'from', 'to', 'justification', 'evidence', 'beyond_initial_hypothesis'],
      ),
    ),
    unresolved: s.list(s.string()),
    confidence: s.enum(ROUTING_CONFIDENCE),
    context_bindings: s.list(binding, { min: 1 }),
  },
  [
    'faro_type',
    'schema_version',
    'id',
    'signature',
    'status',
    'created_at',
    'repository_roots',
    'hypotheses',
    'probes',
    'confidence',
    'context_bindings',
  ],
);

const routeFact = (extra = {}) =>
  s.object({ value: s.boolean(), evidence: s.list(s.string()), explanation: s.string({ nullable: true }), ...extra }, ['value']);

/**
 * The versioned contract route approval reads. Same shape and the same rule as
 * the admission facts: prose never reaches this decision.
 */
export const routeFactsSchema = s.object(
  {
    contract_version: s.integer({ min: 1 }),
    protected_scope_at_risk: routeFact(),
    architecture_boundary_changed: routeFact(),
    baseline_commitment_at_risk: routeFact({ baseline: s.string({ pattern: ID_PATTERNS.baseline, nullable: true }) }),
    irreversible_data_change: routeFact(),
    external_credentials_required: routeFact(),
    cross_repository_write: routeFact({ repositories: s.list(s.string()) }),
    expanded_beyond_hypothesis: routeFact(),
    unresolved_ambiguity: routeFact(),
  },
  [
    'contract_version',
    'protected_scope_at_risk',
    'architecture_boundary_changed',
    'baseline_commitment_at_risk',
    'irreversible_data_change',
    'external_credentials_required',
    'cross_repository_write',
    'expanded_beyond_hypothesis',
    'unresolved_ambiguity',
  ],
);

export const routeSchema = s.object(
  {
    faro_type: s.enum(['route']),
    schema_version: s.integer({ min: 1 }),
    id: s.string({ pattern: ID_PATTERNS.route }),
    signature: s.string({ pattern: ID_PATTERNS.signature }),
    investigation: s.string({ pattern: ID_PATTERNS.investigation }),
    status: s.enum(ROUTE_STATUS),
    created_at: s.string(),
    routing_confidence: s.enum(ROUTING_CONFIDENCE),
    context: s.object(
      { mandatory: s.list(contextBinding, { min: 1 }), optional: s.list(contextBinding), excluded: s.list(contextBinding, { min: 1 }) },
      ['mandatory', 'excluded'],
    ),
    repositories: s.list(
      s.object({ id: s.string(), role: s.enum(REPOSITORY_ROLES), reason: s.string() }, ['id', 'role', 'reason']),
      { min: 1 },
    ),
    scope: s.object(
      {
        read_scope: s.list(scopeEntry, { min: 1 }),
        write_scope: s.list(scopeEntry),
        protected_scope: s.list(scopeEntry),
        excluded_scope: s.list(scopeEntry),
      },
      ['read_scope', 'write_scope', 'protected_scope', 'excluded_scope'],
    ),
    contracts: s.object({ affected: s.list(s.string()), preserved: s.list(s.string()) }, ['affected', 'preserved']),
    execution_boundary: s.object(
      {
        recommended_isolation: s.enum(ISOLATION_LEVELS),
        required_environment: s.string(),
        source_isolation: s.enum(SOURCE_ISOLATION),
        runtime_isolation: s.enum(RUNTIME_ISOLATION),
        data_scope: s.enum(DATA_SCOPE),
        external_system_mode: s.enum(EXTERNAL_SYSTEM_MODE),
        credential_scope: s.enum(CREDENTIAL_SCOPE),
      },
      [
        'recommended_isolation',
        'required_environment',
        'source_isolation',
        'runtime_isolation',
        'data_scope',
        'external_system_mode',
        'credential_scope',
      ],
    ),
    verification: s.list(
      s.object(
        {
          id: s.string({ pattern: /^VER-\d{2}$/ }),
          kind: s.enum(VERIFICATION_KINDS),
          statement: s.string(),
          traces_to: s.list(s.string(), { min: 1 }),
        },
        ['id', 'kind', 'statement', 'traces_to'],
      ),
      { min: 1 },
    ),
    working_tree: s.object(
      {
        clean: s.boolean(),
        overlapping_paths: s.list(s.string()),
        execution_guidance: s.string(),
      },
      ['clean', 'overlapping_paths', 'execution_guidance'],
    ),
    route_facts: routeFactsSchema,
    ambiguities: s.list(s.string()),
    stop_conditions: s.list(s.string(), { min: 1 }),
    approval: s.object(
      {
        required: s.enum(['none', 'human']),
        granted: s.boolean(),
        granted_by: s.string({ nullable: true }),
        granted_at: s.string({ nullable: true }),
      },
      ['required', 'granted'],
    ),
    rebase: s.object(
      {
        routed_from: s.string({ pattern: ID_PATTERNS.route }),
        rebased_at: s.string(),
        changed_bindings: s.list(s.string(), { min: 1 }),
        previous_confidence: s.enum(ROUTING_CONFIDENCE),
        previous_scope_summary: s.string(),
        reconsidered: s.boolean(),
        reconsidered_at: s.string({ nullable: true }),
        scope_added: s.list(s.string()),
        scope_removed: s.list(s.string()),
        confidence_changed: s.boolean({ nullable: true }),
      },
      ['routed_from', 'rebased_at', 'changed_bindings', 'previous_confidence', 'previous_scope_summary', 'reconsidered'],
    ),
    superseded_by: s.string({ pattern: ID_PATTERNS.route, nullable: true }),
    rejected_at: s.string({ nullable: true }),
    rejection_reason: s.string({ nullable: true }),
    context_bindings: s.list(binding, { min: 1 }),
    repository_bindings: s.list(repositoryBinding),
  },
  [
    'faro_type',
    'schema_version',
    'id',
    'signature',
    'investigation',
    'status',
    'created_at',
    'routing_confidence',
    'context',
    'repositories',
    'scope',
    'contracts',
    'execution_boundary',
    'verification',
    'working_tree',
    'route_facts',
    'stop_conditions',
    'approval',
    'context_bindings',
  ],
);

/**
 * Which route fact forces a named human, and why. This table is the policy.
 */
export const ROUTE_APPROVAL_TRIGGERS = {
  protected_scope_at_risk: 'the route may touch a protected surface',
  architecture_boundary_changed: 'the route is suspected to change an architecture boundary',
  baseline_commitment_at_risk: 'the route may invalidate an active baseline commitment',
  irreversible_data_change: 'the route implicates a migration or an irreversible data change',
  external_credentials_required: 'the route requires external credentials or a provider sandbox',
  cross_repository_write: 'the write scope crosses more than one repository',
  expanded_beyond_hypothesis: 'the investigation expanded beyond the capability boundary it started from',
  unresolved_ambiguity: 'the route leaves an ambiguity unresolved',
};

/**
 * Decide whether a route needs a named human before it can be used.
 *
 * Pure function of the route's structured facts and confidence — the same
 * contract shape admission uses, so there is one approval architecture, not two.
 *
 * @param {Record<string, any>} route
 * @returns {{ level: 'none' | 'human', reasons: string[] }}
 */
export function requiredRouteApproval(route) {
  const reasons = [];
  const facts = route?.route_facts ?? {};

  if (route?.routing_confidence !== 'high') {
    reasons.push(`routing confidence is ${route?.routing_confidence ?? 'unknown'}`);
  }
  for (const [name, reason] of Object.entries(ROUTE_APPROVAL_TRIGGERS)) {
    if (facts[name]?.value === true) reasons.push(reason);
  }
  return { level: reasons.length > 0 ? 'human' : 'none', reasons };
}

/**
 * Cross-check route facts and scopes against the contract's own structure.
 *
 * Claude asserts; the toolkit refuses assertions that contradict what the route
 * actually says. Several facts are fully derivable, and those are checked rather
 * than trusted.
 *
 * @param {Record<string, any>} route
 * @param {Record<string, any> | null} investigation
 * @param {{ baselineStatus: (id: string) => string | undefined }} lookups
 * @returns {{path: string, message: string}[]}
 */
export function validateRoute(route, investigation, lookups) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });
  const facts = route?.route_facts;
  const scope = route?.scope ?? {};

  if (!facts) return [{ path: 'route_facts', message: 'is required but missing' }];
  if (facts.contract_version !== ROUTE_FACTS_VERSION) {
    add('route_facts.contract_version', `must be ${ROUTE_FACTS_VERSION}`);
  }

  for (const name of Object.keys(ROUTE_APPROVAL_TRIGGERS)) {
    const entry = facts[name];
    if (entry?.value !== true) continue;
    if ((entry.evidence ?? []).length === 0 && !entry.explanation) {
      add(`route_facts.${name}`, 'is asserted true but carries no evidence or explanation a human could check');
    }
  }

  // Scopes must not contradict each other. A write scope that overlaps a
  // protected or excluded surface is not a judgement call — it is incoherent.
  // Containment counts, not just equality: a write entry sitting under a protected
  // directory is the same contradiction as naming the directory writable, and it
  // is the one an executor is most likely to act on by accident.
  const key = (entry) => `${entry.repository}:${entry.path}`;
  const covers = (outer, inner) =>
    outer.repository === inner.repository &&
    (outer.path === inner.path || inner.path.startsWith(`${String(outer.path).replace(/\/+$/, '')}/`));
  for (const write of scope.write_scope ?? []) {
    for (const entry of scope.protected_scope ?? []) {
      if (covers(entry, write)) {
        add('scope.write_scope', write.path === entry.path
          ? `${key(entry)} is listed as both writable and protected`
          : `${key(write)} is writable but sits inside protected ${key(entry)}`);
      }
    }
    for (const entry of scope.excluded_scope ?? []) {
      if (covers(entry, write)) {
        add('scope.write_scope', write.path === entry.path
          ? `${key(entry)} is listed as both writable and excluded`
          : `${key(write)} is writable but sits inside excluded ${key(entry)}`);
      }
    }
  }
  for (const entry of scope.read_scope ?? []) {
    if ((scope.excluded_scope ?? []).some((other) => key(other) === key(entry))) {
      add('scope.read_scope', `${key(entry)} is listed as both readable and excluded`);
    }
  }

  // Derivable facts are derived, not trusted.
  const writeRepositories = [...new Set((scope.write_scope ?? []).map((entry) => entry.repository))];
  if (writeRepositories.length > 1 && facts.cross_repository_write?.value !== true) {
    add('route_facts.cross_repository_write', `must be true because the write scope spans ${writeRepositories.join(', ')}`);
  }
  if (writeRepositories.length <= 1 && facts.cross_repository_write?.value === true) {
    add('route_facts.cross_repository_write', 'is true but the write scope stays inside one repository');
  }
  if ((route.ambiguities ?? []).length > 0 && facts.unresolved_ambiguity?.value !== true) {
    add('route_facts.unresolved_ambiguity', 'must be true because the route records ambiguities');
  }
  const credentialScope = route.execution_boundary?.credential_scope;
  if (credentialScope && credentialScope !== 'none' && facts.external_credentials_required?.value !== true) {
    add('route_facts.external_credentials_required', `must be true because credential_scope is "${credentialScope}"`);
  }
  if (facts.baseline_commitment_at_risk?.value === true) {
    const baseline = facts.baseline_commitment_at_risk.baseline;
    if (!baseline) add('route_facts.baseline_commitment_at_risk', 'is true but does not identify the baseline');
    else if (lookups.baselineStatus(baseline) === undefined) {
      add('route_facts.baseline_commitment_at_risk', `names ${baseline}, which does not exist`);
    }
  }
  if (investigation) {
    const expanded = (investigation.expansions ?? []).some((entry) => entry.beyond_initial_hypothesis === true);
    if (expanded && facts.expanded_beyond_hypothesis?.value !== true) {
      add('route_facts.expanded_beyond_hypothesis', `must be true because ${investigation.id} recorded an expansion beyond its hypothesis`);
    }
  }

  // Low confidence must stop, not widen. A route that admits it does not know
  // where the work belongs cannot also claim a write scope.
  if (route.routing_confidence === 'low' && (scope.write_scope ?? []).length > 0) {
    add('scope.write_scope', 'must be empty at low confidence — a route that cannot locate the work may not authorise writing to it');
  }
  if (route.routing_confidence === 'low' && (route.stop_conditions ?? []).length === 0) {
    add('stop_conditions', 'must name what a human has to resolve before this route can proceed');
  }

  // Every verification obligation must trace to something.
  for (const [index, obligation] of (route.verification ?? []).entries()) {
    if ((obligation.traces_to ?? []).length === 0) {
      add(`verification[${index}].traces_to`, 'must trace to an acceptance topic, risk characteristic, or protected contract');
    }
  }
  return issues;
}

/* ------------------------------------------------------------ registry */

/** Every canonical artifact type, by `faro_type`. Declared last so it can name
 * the routing schemas defined above it. */
export const SCHEMAS = {
  charter: charterSchema,
  requirement: requirementSchema,
  decision: decisionSchema,
  knowledge: knowledgeSchema,
  baseline: baselineSchema,
  obligation: obligationSchema,
  intake: intakeSchema,
  proposal: proposalSchema,
  signature: signatureSchema,
  investigation: investigationSchema,
  route: routeSchema,
  view: viewSchema,
};
