---
name: faro-route-synthesis
description: Turn a Requirement Signature and its probe evidence into a Route Contract — context selection, read/write/protected/excluded scope, proportional isolation, verification obligations, confidence, and stop conditions. Use at the end of /faro-route and again when reconsidering a rebased route.
---

# Route contract synthesis

The signature said what the work means. The investigation found where it lives. The contract
says what a later execution is **allowed to do**.

Everything in it must trace to one of those two. A scope entry with no probe behind it is a
guess with a file path attached.

## Context — three lists, all required

**Mandatory** — needed to understand or safely do the work: the charter principles that bind
it, the delivery definition, related requirement versions, applicable decisions, cross-cutting
knowledge, the active baseline when it selects this requirement.

**Optional** — useful as analogy or pattern, not authoritative: a similar provider
integration, a prior decision that rhymes.

**Excluded** — deliberately kept out, each with a reason. This list is the one that keeps an
execution capsule small. "Scoring knowledge — this route changes ingestion, not
interpretation" tells a reviewer you considered it and why it is out.

Every entry names an exact artifact. "Project knowledge" is not a context binding.

## Scope — four kinds, and they must not contradict

| Scope | Meaning |
|---|---|
| **read** | execution may inspect this to do the work |
| **write** | the smallest surface execution is expected to modify |
| **protected** | must not be modified without amending the route |
| **excluded** | deliberately unrelated; keeping it out prevents drift |

Each entry names a repository, a path, and **why**. Directory-level entries are fine where
file-level precision is not yet justified — false precision is worse than an honest boundary.
Do not name a file you have no probe evidence for.

The toolkit refuses a write entry that a protected or excluded entry covers, and a read entry
that names exactly the same path as an excluded one. Those are not judgement calls; they are
incoherent contracts. A read entry sitting *inside* an excluded directory is not caught — keep
that one coherent yourself.

**Protected scope is where routing earns its keep.** An identity contract, an accepted public
API, a raw-evidence store, production migration history, a security boundary — name them
explicitly even when the work is nowhere near them, because the whole point is that a later
implementer who drifts toward one hits a declared boundary instead of a surprise.

## Isolation, proportional to risk

Map the signature's risk characteristics onto the boundary. The overall
`recommended_isolation` is the headline; the dimensions refine it.

| Work | Isolation | Why |
|---|---|---|
| documentation or terminology | `context` · source `none` · runtime `none` | nothing runs, nothing stored changes |
| a local mapper or pure function | `branch` · runtime `local_process` · data `fixtures` | reversible, targeted tests suffice |
| a provider integration | `worktree` · external `sandbox` · credential `sandbox` · data `fixtures` | touches a system we do not control |
| a migration | `disposable_environment` · data `disposable_database` | irreversible against stored state |
| identity or provenance semantics | `critical` · data `dedicated_dataset` · credential `sandbox` | wrong output is indistinguishable from right output until much later |

`credential_scope` above `none` forces the `external_credentials_required` fact, which forces
human approval. That is intended: nobody should hand out sandbox credentials by inference.

## Verification obligations, proportional too

One list, each entry with a `kind`, a `statement` a later implementation can be judged
against, and `traces_to` naming the acceptance topic, risk characteristic, or protected
contract it exists for.

An obligation that traces to nothing is ceremony. Copying a full gauntlet onto every route
teaches people to ignore it, which is worse than having none — so a documentation route gets
a documentation check, and an identity route gets negative probes for duplicate, correction,
and identity conflict.

Reach for `negative_probe` whenever the failure mode is *wrong data that looks right*: a
duplicate silently dropped, a correction silently discarded. Those are not caught by asserting
the happy path.

## Working tree

Record whether the tree is clean, which uncommitted paths overlap the candidate scope, and
what execution should do about it. Uncommitted work inside the write scope is a real hazard —
say whether to stop, isolate, or preserve it. Never suggest discarding it.

## Confidence and stop conditions

Confidence is the investigation's, carried forward honestly. **A `low`-confidence route may
not declare a write scope at all** — the toolkit enforces it. A route that cannot locate the
work cannot authorise changing it, and the honest output is a stop condition and a focused
question.

Stop conditions are always required. They name what makes execution halt and come back:
an undeclared boundary crossing, a missing contract, an ambiguity that turns out to matter,
evidence that contradicts the route.

## Route facts

The same contract shape admission uses, and the same rule: **approval reads the facts, never
the prose.** Assert each with evidence. The toolkit derives what it can and refuses
contradictions — `cross_repository_write` must match the write scope, `unresolved_ambiguity`
must match the ambiguities list, `external_credentials_required` must match the credential
scope, and an `expanded_beyond_hypothesis` recorded in the investigation must be asserted here.

Any fact true, or confidence below `high`, requires a named human:

```bash
node .claude/faro/tools/faro.mjs route-approve ROUTE-0001 --by "Their Name"
```

Never grant it yourself.

## What a route is not

It is not a plan, a task list, or a design. It does not say how to implement anything, in what
order, or with which approach — that is the executing slice's job, and pre-deciding it here
would smuggle implementation choices past the decision registry. The route says what may be
touched, how isolated, and what must be proven. Nothing else.
