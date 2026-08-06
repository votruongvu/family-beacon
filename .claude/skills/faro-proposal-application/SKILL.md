---
name: faro-proposal-application
description: Turn an approved intake proposal into canonical Faro artifacts — draft file shape, identity and version lineage, approval gates, staleness refusal, and which generated views to regenerate. Use when writing draft artifacts during /faro-intake or when applying a proposal with /faro-apply.
---

# Applying a proposal

Application is the only path that mutates canonical state. It is narrow on purpose: apply
what the proposal declared, to the artifacts it named, and nothing else.

## Draft artifacts

Each `changes:` entry names a draft file in `.faro/intake/proposals/PROP-NNNN.draft/`. A
draft is an ordinary canonical artifact **minus the fields Faro assigns**.

Never set these in a draft — `faro apply` rejects the whole operation if you do:

```text
id  ·  version  ·  created_at  ·  updated_at  ·  origin  ·  revision_of  ·  charter_version
```

They are assigned at apply time so identity cannot collide and lineage cannot be forged.

Do set: `faro_type`, `status`, `title`, and the type's own fields, plus every required `##`
section in the body. `faro apply` validates the finished artifact before writing, so a
missing `## Acceptance criteria` fails the apply rather than producing a bad requirement.

| Operation | Draft type | Produces |
|---|---|---|
| `create_requirement` | requirement | `requirements/REQ-NNNN/v1.md` |
| `revise_requirement` | requirement | `requirements/<target>/v<N+1>.md`, `revision_of` set |
| `create_decision` | decision | `decisions/DEC-NNNN/v1.md` |
| `revise_decision` | decision | `decisions/<target>/v<N+1>.md` |
| `create_knowledge` | knowledge | `knowledge/KNW-NNNN.md` |
| `update_knowledge` | knowledge | replaces `knowledge/<target>.md`, keeps `created_at` |
| `create_obligation` | obligation | `obligations/OBL-NNNN.md`, status `unrouted` |
| `update_charter` | charter | new `charter/charter.md`, old archived to `_history/` |

`revise_requirement`, `revise_decision`, and `update_knowledge` need a `target:` on the
change entry.

## Identity and versioning

- Requirement identity is stable across revisions: `REQ-0041` stays `REQ-0041`.
- Each accepted version is immutable. A revision writes `v2.md`; `v1.md` is never edited.
- `revision_of: REQ-0041@1` records lineage. Faro sets it — do not.
- A genuinely new obligation gets a **new identity**, not a version bump on something
  adjacent. Versioning an unrelated requirement to avoid a new id destroys traceability.
- Baselines keep pointing at the versions they selected. A new version does not alter a
  baseline; only an explicit baseline amendment does.

Knowledge is current truth rather than versioned history: `update_knowledge` replaces the
item, preserving `created_at` and stamping `updated_at`. If the *old* fact matters, it was a
requirement or a decision, not knowledge.

## Approval comes from the facts, not the prose

`semantic_facts` is a versioned contract, and it is the only input to approval policy. The
toolkit never reads a title, a summary, or a reasoning section to judge severity — so no
amount of careful wording can lower a gate, and no amount of alarming wording can raise one.

A named human is required when the classification is `project_charter_change` or
`change_request`, when confidence is `low`, or when any of these facts is `true`:

```text
project_charter_affected      accepted_requirement_affected   requirement_superseded
active_baseline_affected      accepted_behavior_changed       decision_revised
active_obligation_invalidated ambiguity_unresolved
```

Assert each fact with evidence a human could check, and bind every path you cite:

```yaml
accepted_requirement_affected:
  value: true
  requirements: [REQ-0004]
  evidence: [requirements/REQ-0004/v1.md, baselines/BL-0001.md]
```

The toolkit cross-checks the facts against the mutation set and refuses contradictions —
`requirement_superseded: false` while revising a requirement, a `change_request` that claims
no accepted behaviour changed, `active_baseline_affected: true` naming a baseline that is not
active. That is what stops a proposal from declaring its way to a lower gate.

Approval itself is a person's name and a timestamp. The user grants it with
`/faro-approve PROP-0007`. Never grant it on their behalf.

## What apply refuses

**A stale proposal.** A canonical file in `context_bindings` changed since the proposal was
written. There is no override, because the classification was reached against project state
that no longer exists. The user carries it forward with `/faro-rebase PROP-NNNN`.

**An un-reconsidered rebase.** A rebased proposal carries the original's assertions forward as
a starting point. Until `rebase.reconsidered` is true, it cannot be applied.

**Contradictory facts, or an understated approval.** Both are computed, not trusted.

## Bugs and work units become obligations

A `bug` or a `work_unit` produces an **obligation**, not a requirement and not nothing:

```text
obligations/OBL-0001.md   kind: bug   status: unrouted
```

An obligation records accepted work that is not a requirement. It is routable — `/faro-route
OBL-0001` compiles it and `/faro-work` implements it — but closing the proposal without a record
would make the project read as finished when it is not. Faro keeps reporting every open
obligation, and only an explicit close by the user ends it:

```text
/faro-close OBL-0001 --status fulfilled --reason "fixed in the ingestion worker"
```

Never invent a requirement to give a defect somewhere to live. A defect means the requirement
was right and the code was wrong; writing a new requirement would record the opposite.

## Which views regenerate

Only the ones whose sources moved:

| Change | Regenerates |
|---|---|
| `update_charter` | `PROJECT_COMPASS.md` and `REQUIREMENTS.md` (the register names deliveries) |
| `create_requirement` / `revise_requirement` | `REQUIREMENTS.md` |
| decision / knowledge only | nothing |

An additive requirement must never cause the compass to be rewritten. If it does, that is a
bug in Faro, not an acceptable side effect.

## Applying is one transaction

Apply never writes into the live store directly. It copies the store into a staging area,
applies every mutation there, regenerates the affected views, and validates the *resulting
whole store* — then commits the changed files together and advances `storeRevision`.

So a failure has exactly two possible outcomes: the complete new state, or the complete prior
state. If the process dies mid-commit, `faro inspect` reports the unfinished transaction and
`faro recover` rolls it back to the prior state. Nothing rolls forward silently.

## After applying

Run `faro inspect`. Then tell the user what was admitted, what was written, what was **not**
touched, whether any obligation is now outstanding, and whether any other open proposal went
stale because a file it was bound to just changed.
