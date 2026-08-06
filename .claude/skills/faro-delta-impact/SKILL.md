---
name: faro-delta-impact
description: Work out the smallest true blast radius of a new input — which requirements, decisions, knowledge, baselines, and work it actually affects, and what it explicitly does not. Use during /faro-intake before writing a proposal, and whenever assessing whether a change reopens committed scope.
---

# Delta impact

The failure Faro exists to prevent is a small addition triggering a large regeneration. So
impact assessment starts narrow and has to *earn* every expansion.

> Start from the input. Expand one justified relationship hop at a time. Stop when no
> supported path remains.

## The traversal

**Hop 0 — the input itself.** What does it directly name or obviously target? Usually one
requirement, one decision, or nothing yet.

**Hop 1 — direct relations.** From each hop-0 item, follow only relations that carry meaning
for *this* input:

| Relation | Expand when |
|---|---|
| `refines` / `derived_from` | the parent's meaning changes, or the child contradicts it |
| `depends_on` | the dependency's obligation changes, not merely its implementation |
| a decision's `constrains:` list (decision → requirement) — a field, not a `relations` entry | the constraint itself is in question |
| `supersedes` | lineage matters for what is currently in force |
| `conflicts_with` | always — an unresolved conflict is a reviewable fact |
| `affects` | only with a stated reason; `affects` is the weakest edge in the model |

**Hop 2 — baseline membership.** Does any affected requirement *version* appear in an
active baseline? This is the question that decides whether a human is needed.

**Hop 3 — stop.** A third hop needs an explicit reason a reviewer would accept. "It is
related" is not one. Semantic similarity is not a supported path.

## Baseline impact

A baseline pins exact requirement versions (`REQ-0002@1`). Three outcomes, recorded as the
`active_baseline_affected` semantic fact:

- **Not impacted** — the input adds something new, or touches requirements the baseline
  never selected. Assert `value: false`. Admission is automatic; target the next baseline.
- **Impacted** — the input revises a requirement version the active baseline selected, so
  committed scope changes. Assert `value: true`, name the `baseline`, and cite it as evidence.
  Human approval, always.
- **Ambiguous** — you cannot tell. Record it in `ambiguities`, assert
  `ambiguity_unresolved: true`, and let a human decide. Guessing "not impacted" is the
  expensive direction to be wrong in.

The toolkit checks the baseline you name actually exists and is actually active, so this fact
cannot be asserted loosely.

Adding a requirement to the registry never impacts a baseline by itself. Baselines select
versions; they are not affected by versions they did not select. This is exactly why
continuous intake works: the registry grows while a commitment stays frozen.

## Stating what is *not* affected

Every proposal must list, item by item with a reason, what it does not touch. This is not
paperwork — it is the only way a reviewer can check the boundary rather than trust it.

Cover at minimum:

- Each related requirement you considered and left alone, and why.
- The charter, unless the classification is `project_charter_change`.
- Every active baseline, unless `active_baseline_affected` is true.
- Every decision that constrains the area but does not change.
- Every open obligation the input might have invalidated but did not.

Good: `REQ-0002 — Fitbit ingestion keeps its current version; Huawei is an additional
provider, not a change to Fitbit.`

Useless: `Other requirements are unaffected.`

## Context binding — the mechanism that makes this hold

The files you actually read become the proposal's `context_bindings`, recorded with their
content hashes by `faro bind`. If one of them changes, `faro apply` refuses the proposal.

Two failure modes to avoid:

- **Binding too much** ("everything, to be safe") makes the proposal expire on the next
  unrelated edit, so people learn to ignore staleness.
- **Binding too little** lets a proposal be applied after the reasoning behind it stopped
  being true.

Bind what you read. That is both the honest answer and the correct one.

The design is deliberately source-bound rather than commit-bound: another proposal being
applied elsewhere in the project does not invalidate this one. Only a change to a file this
reasoning rests on does.

## Repository probes

Only one classification question needs code: is this a defect against an accepted
requirement, or behaviour nobody defined? When you probe:

- Start from the accepted requirement's acceptance criteria and look for the specific path
  they describe.
- Record what you checked in `repository_probe.reason` — a probe nobody can retrace is not
  evidence.
- Do not widen into general code review. You are answering one classification question.

For everything else, set `repository_probe.required: false` and say why the registry was
enough. The repository is implementation truth, but it is not evidence about what the
project *intends*.
