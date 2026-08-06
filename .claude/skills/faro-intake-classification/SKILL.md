---
name: faro-intake-classification
description: Decide which project layer a new input belongs to — charter change, project knowledge, new requirement, requirement revision, decision, bug, change request, or work unit. Use whenever an idea, request, discovery, defect, or change arrives and the target layer is not already settled, especially during /faro-intake.
---

# Intake classification

Every input gets exactly one **primary** classification and any number of **supporting**
ones. The primary answers "what is this, fundamentally?" — supporting updates are other
layers the same input justifies touching.

Classification is the whole point of Faro. Get it wrong and the consequences are concrete:
a new capability admitted as a change request reopens committed scope for no reason; a
defect admitted as a requirement revision rewrites accepted truth to match broken code.

## Decision order

Work down. The first test that clearly matches is the primary classification. If two match,
read the tie-breaker for that pair below.

**1 · Does it change project direction?**
Purpose, a major delivery's definition, milestone direction, a scope boundary, the
definition of success, or a non-negotiable principle.
→ `project_charter_change` — always requires human approval.

**2 · Is it a reusable fact rather than something to do?**
A domain rule, provider constraint, technical discovery, established pattern, shared term,
or a lesson worth carrying into future work.
→ `project_knowledge`

**3 · Does it ask for a capability, outcome, or obligation the project does not have?**
→ `new_requirement`

**4 · Does it clarify, narrow, extend, or replace an existing requirement?**
→ `requirement_revision`

**5 · Does it choose *how* rather than define *what*?**
An approach, trade-off, technology choice, or operating policy.
→ `decision`

**6 · Does the implementation contradict an already accepted requirement?**
→ `bug` — the requirement is right, the code is wrong. This admits an **obligation**, not a
requirement: writing a requirement here would record the opposite of what happened.

**7 · Must accepted or baselined behaviour deliberately change?**
→ `change_request` — always requires human approval.

**8 · Is it an implementation step inside an already accepted, already scoped requirement?**
→ `work_unit` — also an obligation. Faro accepts the work, which can then be routed and worked
like a requirement, and the obligation stays open until it is closed so the project does not read
as finished.

## The distinctions that actually get confused

**new_requirement vs. change_request.** The test is *does any accepted or baselined
behaviour become wrong?* Adding a fourth provider does not change what the first three
must do — that is additive, however much prior art exists. Only reach for a change request
when something already accepted must now mean something different.

> A change request is not the container for "everything that arrives after the project
> started". That habit is what turns change control into a repair mechanism.

**new_requirement vs. requirement_revision.** Would the existing requirement's acceptance
criteria, read strictly, already oblige this? If yes, the input clarifies it — revise. If
it adds an obligation the existing criteria do not carry, it is new. When the honest answer
is "depends how broadly you read it", record both readings in `ambiguities` and set
confidence to `medium`. Do not resolve it silently in either direction.

**requirement vs. decision.** Requirements say what must be true for the project to have
delivered; decisions say how the project chose to make it true. "Support Huawei health
data" is a requirement. "Integrate the cloud API rather than the native SDK" is a decision.
The signal is substitutability: if a different approach could satisfy the same input, the
input is a requirement and the approach is a separate decision.

**bug vs. everything else.** A bug requires a specific accepted requirement whose
acceptance criteria the implementation contradicts. Name it, quote the criterion, and check
the code. If the behaviour was never defined, it is a new requirement or a revision — not a
bug. If it was defined and we now want it different, it is a change request.

**work_unit vs. new_requirement.** A work unit is invisible outside the requirement it
belongs to. If the input creates an obligation someone outside the implementation would
care about — or spans more than one delivery — it is a requirement, even if it sounds
technical.

## Evidence each classification needs

| Classification | Must be able to name |
|---|---|
| `project_charter_change` | the charter element that changes, and the human who approves it |
| `project_knowledge` | provenance — who said it, which document, or which file |
| `new_requirement` | the objective it aligns to and the delivery it contributes to |
| `requirement_revision` | the exact target requirement, and what its current version fails to cover |
| `decision` | the requirement or principle it constrains, and whether it is high impact |
| `bug` | the accepted requirement, the criterion contradicted, and the code path checked |
| `change_request` | the accepted or baselined behaviour that must change, and its baseline |
| `work_unit` | the admitted requirement it implements |

If you cannot name the required evidence, you have not classified it yet — investigate or
record the gap in `ambiguities` and assert `ambiguity_unresolved: true`. An unsupported
classification stated confidently is worse than one marked `low` confidence.

Everything in this table also has to be expressed as a **semantic fact** on the proposal —
that structured assertion, not your prose, is what decides whether a human must approve. See
the **faro-proposal-application** skill for the contract.

## Confidence

- `high` — the decision order matched cleanly, and the evidence above is in hand.
- `medium` — two classifications were defensible; both are recorded in `ambiguities`.
- `low` — the input is underspecified, or its classification depends on a fact nobody has.

`low` confidence forces human approval automatically, whatever the classification. That is
deliberate: uncertainty should cost a conversation, not a wrong write.

## When you must not load the repository

Classification runs on the registry, not on code. The single exception is step 6 — telling a
defect from an undefined semantic. Everything else is answerable from the charter, the
registry, and the input. Reaching for code first is how classification turns into
implementation analysis.
