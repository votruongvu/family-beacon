---
description: Capture a new idea, classify it into the right project layer, and propose the delta — without changing canonical state.
argument-hint: "<the idea, request, discovery, defect, or change in plain language>"
---

# /faro-intake

The single entry point for anything new. The user should never have to know whether their
idea is a charter change, project knowledge, a requirement, a revision, a decision, a
defect, a change request, or an implementation detail — that is your job.

**You produce a proposal. You never apply it.** Canonical state changes only through
`/faro-apply`, after a human has seen the classification.

## Procedure

### 1. Capture the input verbatim

```bash
node .claude/faro/tools/faro.mjs next-id intake
```

Write `.faro/intake/records/INT-NNNN.md` with the id you were given. The `## Original input`
section holds the user's words **unedited** — this record is immutable evidence, and later
classification arguments are only checkable against what was actually said.

### 2. Load the minimum context to classify

Read, in this order, and stop as soon as you can classify confidently:

1. `.faro/views/PROJECT_COMPASS.md` — direction, deliveries, milestones, scope boundaries
2. `.faro/views/REQUIREMENTS.md` — what is already an obligation, and its status
3. The specific requirement, decision, and knowledge files the input plausibly touches
4. `.faro/baselines/` — only if the input might affect committed scope

Do **not** read repository source at this stage, and do not load the whole registry. Load
the items you can name a reason for.

### 3. Classify

Follow the **faro-intake-classification** skill. It carries the decision order, the
distinguishing tests between neighbouring classifications, and what evidence each one needs.

Exactly one primary classification. Supporting classifications are allowed, and are for
updates to *other* layers the same input justifies.

### 4. Probe the repository only when classification depends on it

One case needs code: telling a **bug** ("the implementation contradicts an accepted
requirement") from a **new requirement or revision** ("the behaviour was never defined") or
a **change request** ("we are deliberately changing accepted behaviour").

Probe narrowly — find the specific code path the accepted requirement talks about. Record
`repository_probe.required: true` and what you checked. If you did not need code, say so and
why; an unnecessary probe is context you spent for nothing.

### 5. Assess the delta

Follow the **faro-delta-impact** skill. Start from the input, expand one justified
relationship hop at a time, and stop when no supported path remains.

You must state what is **not** affected, item by item, with a reason. A proposal that only
lists what it touches gives the reviewer no way to check that you looked at the boundary.

### 6. Write the proposal

```bash
node .claude/faro/tools/faro.mjs next-id proposal
```

Write `.faro/intake/proposals/PROP-NNNN.md`. Every draft artifact goes in
`.faro/intake/proposals/PROP-NNNN.draft/` and is referenced by a `changes:` entry.

Draft artifacts are ordinary requirement / decision / knowledge / obligation / charter files
**minus the fields Faro assigns**: no `id`, `version`, `created_at`, `updated_at`, `origin`,
`revision_of`, `charter_version`. Setting them is rejected — identity and lineage are assigned
at apply time so they cannot be forged or collide.

A `bug` or a `work_unit` produces an **obligation** draft, not a requirement. An obligation
records accepted work that is not a requirement: it can be routed with `/faro-route` and worked
with `/faro-work`, and it stays open until somebody closes it with `/faro-close`. Never invent a
requirement to give a defect somewhere to live.

Every proposal changes something. There is no "recorded and closed" outcome: if the input
should not be admitted at all, say so and let the user reject it.

### The semantic facts

`semantic_facts` is a versioned contract, and it is the **only** thing approval policy reads.
Prose cannot raise or lower a gate — so assert each fact deliberately, and give evidence a
human could check:

```yaml
active_baseline_affected:
  value: true
  baseline: BL-0001
  evidence: [baselines/BL-0001.md, requirements/REQ-0004/v1.md]
```

Every path you cite as evidence must also be in `context_bindings`. That is deliberate: a fact
whose evidence moves should make the proposal stale, not quietly wrong.

The toolkit cross-checks your facts against your own mutation set — asserting
`requirement_superseded: false` while revising a requirement is rejected, as is a
`change_request` that claims no accepted behaviour changes. Set `approval.required` to match;
`faro verify` recomputes it and fails an understatement.

### 7. Bind the proposal to the context it was reasoned from

```bash
node .claude/faro/tools/faro.mjs bind PROP-NNNN charter/charter.md requirements/REQ-0002/v1.md ...
```

List every canonical file you actually read to reach this classification. This is what makes
the proposal refusable later: if one of those files changes, the reasoning behind the
proposal no longer holds and `faro apply` refuses it. Binding files you did not read makes
the proposal fragile for no reason; omitting files you did read makes it unsafe.

Then set `proposal: PROP-NNNN` in the intake record.

### 8. Validate and report

```bash
node .claude/faro/tools/faro.mjs inspect
```

Report to the user: the classification and why, the alternatives you rejected and what ruled
them out, what changes, what explicitly does not, whether approval is needed, and the exact
next command.

## Boundary

Capture, classify, relate, assess, propose — then stop. `/faro-intake` never writes to
`.faro/charter/`, `.faro/requirements/`, `.faro/decisions/`, `.faro/knowledge/`, or
`.faro/baselines/`, and never runs `faro apply`.
