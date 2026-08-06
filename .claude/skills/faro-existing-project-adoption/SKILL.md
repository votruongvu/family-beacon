---
name: faro-existing-project-adoption
description: Map an existing repository into Faro's current project truth — choosing a bounded source set, separating intended direction from implementation evidence, drafting only what is still active, and reporting every conflict as an ambiguity rather than resolving it. Use during /faro-adopt, when a project already has code, documents, and work in flight.
---

# Adopting an existing project

The job is a **trustworthy current-state starting point**, not a reconstruction of how the
project got here. Enough truth to classify and route the next work item safely, and nothing
invented to fill a gap.

Classification, delta impact, charter authorship, and draft shape are not restated here — use
`faro-intake-classification`, `faro-delta-impact`, `faro-project-compass`, and
`faro-proposal-application` as you would for any other input. What follows is only what is
different when the input is a repository that already exists.

## 1 · Source authority, five tiers

The tiers are not a ranking of quality. They answer different questions, and conflating them is
how a project ends up with requirements nobody agreed to.

| Tier | Source | Establishes |
|---|---|---|
| 1 | explicit user statements | intended direction — the strongest evidence of intent |
| 2 | active accepted documents — overview, current architecture, roadmap, live ADRs | intended project truth |
| 3 | repository metadata — manifests, workspace layout, config examples | implementation *shape*, never intent |
| 4 | the current working tree | implementation truth |
| 5 | git history | historical evidence only |

**Tier 4 is the one that goes wrong.** Code is what the project *does*, never what it has
*agreed to*. A behaviour found only in code may be intentional, accidental, legacy, incomplete, or
a defect, and nothing in the file distinguishes them. Record it as knowledge, not a requirement —
`provenance: repository` — or as an ambiguity. It becomes requirement truth only when an accepted
document or the user confirms it.

**Tier 5 is not read by default.** Consult git history only when the user asks, when a material
current-state ambiguity cannot be settled from active sources, or when the reason for a
still-governing decision exists nowhere else. When you do, say so and say why.

## 2 · Choose sources before reading deeply

Candidates worth considering:

```text
README*            docs/            architecture/      design/
roadmap*           requirements/    adr/ · decisions/  CLAUDE.md
package.json       workspace and module manifests      deployment/config examples
top-level repository structure
```

Excluded by default, and never read unless the user names one as a source:

```text
node_modules/  vendor/  dist/  build/  out/  coverage/  generated output  caches
archived or deprecated documentation      closed tickets      full source trees
git history    binaries    .env    credential files    anything secret-looking
```

A secret value is never read into context and never quoted in a draft. A file that merely *looks*
like it holds credentials is named as excluded, not opened.

Whole source trees, the backlog, and closed or archived work are excluded by default for the same
reason: they describe what happened, not what is currently true.

**A matching filename is not an active document.** Prefer files whose content identifies them as
current; a `roadmap-2019.md` and an `docs/archive/` are history. When you cannot tell whether a
document is live, that is an ambiguity for the user, not a coin toss.

State the selection before drafting anything:

```text
Selected sources     — each with one line on why it matters
Excluded sources     — the categories you skipped, not a file dump
Uncertain authority  — anything you read but could not confirm is current
```

## 3 · Capture only what is still active

**Charter** — current vision, problem, objectives, deliveries, milestones, scope boundaries,
principles, success measures, decision authorities. See the narrow exception in §4.

**Knowledge** — stable facts needed repeatedly: terminology, repository ownership, platforms and
providers in use, runtime and deployment facts, data-flow boundaries, integration conventions,
external constraints. Every item carries provenance. A passing observation is not durable
knowledge.

**Requirements** — only what is currently expected, still relevant, supported by a tier-1 or
tier-2 source, and specific enough to state a desired outcome, a scope, and acceptance criteria.
Do not import completed tickets, abandoned ideas, speculative backlog, implementation detail with
no accepted outcome, or every behaviour visible in code.

**Decisions** — only those still constraining current work: a chosen integration approach, a
supported runtime version, a security or deployment boundary, a data-custody rule. Do not create a
Decision because the code uses one implementation — that is tier 4, and it records what happened,
not what was chosen.

**Obligations** — clearly open accepted bugs and work units. Do not infer a bug from code alone
unless an accepted source proves the implementation contradicts it. Unstructured technical debt is
not an obligation without user or document support.

**Baselines** — never invented here. Read and respect one that exists; when none does, say that
active requirements are admitted first and leave baseline management alone.

> **Prefer omission over invention.** An omitted requirement is added later through
> `/faro-intake` in a minute. An invented one misroutes every change that touches it, and nobody
> knows to doubt it.

## 4 · The narrow charter exception

`/faro-init` writes a blank draft charter. Refining that draft in place is setup, not a change to
project direction — but only while it is genuinely still blank. All of these must hold:

- `charter_version` is `1`
- `status` is `draft`
- no requirement, decision, knowledge item, obligation, or baseline has been admitted

Then refine it directly, preserving the stable `OBJ-` / `DEL-` / `MS-` / `PRN-` / `SM-` / `STK-`
ids, grounding every statement in a selected source, and leaving anything uncertain explicit.
**Keep `status: draft`** unless the user confirms activation in so many words.

If any condition fails, the charter is somebody's agreed direction. An **active** charter, a later
version, or a project that has **already admitted** anything takes the ordinary path: a
`project_charter_change` proposal, which always requires a named human. Never edit
`charter/charter.md` directly, and never create a second charter mutation path.

## 5 · Group into ordinary proposals

Adoption produces normal intake records and proposals. There is no adoption record, session,
manifest, batch, or registry, and no special apply path.

One proposal carries **one** primary classification, and may only contain the operations that
classification permits:

| Proposal | Primary classification | May carry |
|---|---|---|
| charter | `project_charter_change` | `update_charter` + knowledge |
| requirements | `new_requirement` | several `create_requirement`, plus supporting `create_decision` and knowledge |
| decisions | `decision` | `create_decision` + knowledge |
| knowledge | `project_knowledge` | `create_knowledge` / `update_knowledge` |
| bugs | `bug` | `create_obligation` + knowledge |
| work units | `work_unit` | `create_obligation` + knowledge |

**Bugs and work units cannot share a proposal** — their primary classifications differ, and the
toolkit refuses an operation the classification does not allow. Create only the groups that have
content; an empty group is not a proposal.

## 6 · Never duplicate, never overwrite

Before drafting anything, read the existing registries and compare **meaning**, not titles. Faro's
admitted truth is the project's current canonical intent, and an external document does not
outrank it just by being newer.

Where an existing item must change, propose a normal revision — `requirement_revision`,
`revise_decision`, `update_knowledge` — with its own evidence. Never edit an admitted artifact
directly, and never let an import silently replace something a human agreed to.

## 7 · Provenance and binding

Every draft states where it came from, using the five kinds the schema allows:

```text
user-stated   the user said it
document      an accepted project document said it
repository    the implementation currently does this
observation   you noticed it while reading
external      it comes from outside the project
```

`repository` means *the code does this*. It never means *the project requires this*.

**An external document cannot be a context binding.** `context_bindings` resolves inside `.faro/`,
so binding `README.md` or `docs/architecture.md` is refused — they are not store files. Bind each
proposal to the `.faro/` files you actually read while classifying it, and record the external
paths in the draft's `provenance` and in the proposal's `## Reasoning`. That is a real gap: those
sources are named but not hashed, so Faro cannot tell you later that the README moved. Say so
rather than implying the binding covers them.

## 8 · Conflicts are reported, never resolved

Two documents disagree; the roadmap claims a provider is live and the code holds a prototype; the
code supports behaviour no document defines. For each material conflict:

```text
state the conflict          — in one sentence, in the user's terms
identify the sources        — exact paths
say which looks more authoritative, and why  — by tier, not by date
ask for confirmation        — whenever the answer changes project truth
```

Never pick a source by filesystem timestamp; a touched file is not a decision. Worked example:

> `README.md` says health data is read from the device SDK. `docs/architecture.md` (dated in its
> own heading, and the document the services follow) says the provider cloud API. The services
> under `services/ingestion/` contain only cloud clients. The architecture document and the code
> agree, so the README looks stale — but "stale README" is a guess, and if the device SDK is
> genuinely planned this is a live requirement. **Confirm which is current before I draft either.**

Every unresolved conflict is an ambiguity on the proposal, and an ambiguity forces
`ambiguity_unresolved: true`, which forces a named human. That is the point: adoption cannot
quietly promote a guess into project truth.

## 9 · Say honestly what the result is

Adoption ends in one of three states, and all three are legitimate:

- **enough to start** — the next work item can be classified and routed
- **incomplete but usable** — some areas are mapped, others left for `/faro-intake`
- **blocked** — direction is missing and the user must supply it

A project does not need a perfect reconstruction. It needs enough trusted current truth that the
next decision is a safe one. Never present an incomplete map as a complete one.
