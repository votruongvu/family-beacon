---
name: faro-project-compass
description: Author, review, and protect the Faro Project Charter — the durable project direction that outlives every requirement. Use when creating a charter during /faro-init, when an intake proposes changing project direction, or when deciding whether something belongs in the charter at all.
---

# The Project Charter

The charter is Faro's North Star: the direction that stays true while requirements,
knowledge, decisions, and code churn beneath it. It is canonical, hand-authored, and small.

`.faro/views/PROJECT_COMPASS.md` is a **generated projection** of it. Never edit the view —
edit `.faro/charter/charter.md` and run `faro render`.

## What belongs in it

| Element | Id | Holds |
|---|---|---|
| Vision | — | the outcome the project exists to create, in prose |
| Problem | — | what made the project worth doing |
| Objectives | `OBJ-NN` | the few outcomes that define success |
| Deliveries | `DEL-NN` | the things that get shipped |
| Milestones | `MS-NN` | ordered exit outcomes, not dates |
| Scope | — | in, and — with equal care — out |
| Principles | `PRN-NN` | delivery and architecture rules that constrain how work is done |
| Success measures | `SM-NN` | how anyone would know the objectives were met |
| Stakeholders | `STK-NN` | who decides what |

## The size test

> If admitting one ordinary requirement would change the charter, the charter is holding
> something that belongs in a registry.

The charter should stay loadable in full for every intake session. When it grows past a
page or two of substance, something detailed has leaked in. Symptoms:

- An objective that reads like a feature → it is a requirement.
- A principle that names a specific library or endpoint → it is a decision, or knowledge.
- A delivery that lists its own acceptance criteria → those criteria are requirements.
- A scope entry that describes an implementation → it is a requirement or a work unit.

Deliveries and milestones are *names and boundaries*. What must be true inside them lives in
the Requirement Registry and points back with `contributes_to_deliveries` and
`targets_milestones`.

## Writing each element

**Vision** — the outcome, not the plan. It should still be true after two rewrites of the
architecture. If a technology choice appears, it is a decision wearing a vision's clothes.

**Problem** — what goes wrong today, concretely, for someone specific. This is what makes
"is this in scope?" answerable later. A problem statement written as "we lack X" just
restates the solution.

**Objectives** — three to six. If everything is an objective, nothing routes. Each one must
be something a requirement can align *to*: broad enough to outlive individual features,
specific enough that "does this serve OBJ-02?" has an answer.

**Deliveries** — the units a stakeholder would recognise as shipped. Requirements align to
these, which is how a cross-cutting requirement proves it spans several.

**Milestones** — ordered exit outcomes. "Provider expansion — adding a further cloud
provider is a configuration exercise, not a redesign" tells you when you are done. "Q3" does
not.

**Scope — excluded** is the highest-value section and the one most often left empty. Every
explicit exclusion is a future intake Faro can classify as out of scope without a meeting.

**Principles** — the rules that should constrain work nobody has thought of yet. A principle
that only applies to one delivery is a decision.

**Success measures** — observable, and preferably countable. They belong to objectives, not
to milestones.

**Stakeholders** — the point is `decision_authority`, not the org chart. Charter changes,
baseline amendments, and releases each need a named owner, or approval gates have nobody to
stop at.

## Changing the charter

A charter change is `project_charter_change` and **always requires named human approval**.
Before proposing one, check the cheaper explanation first — most inputs that feel
directional are not:

- A new capability under an existing objective → `new_requirement`.
- A constraint discovered while building → `project_knowledge`.
- A chosen approach → `decision`.
- A boundary the charter already implies → nothing changes; cite the existing element.

Genuine charter changes look like: a delivery is added or dropped, an objective is retired,
a scope boundary moves, a principle is reversed, or success is redefined.

When one is genuine, draft the **whole** charter file — `faro apply` archives the current
version to `.faro/charter/_history/` and bumps `charter_version`. Keep ids stable: reusing
`OBJ-02` for a different objective silently rewrites the meaning of every requirement
aligned to it.

## Draft vs. active

`status: draft` means the direction is not agreed yet. `faro inspect` reports it as a
warning, because every classification downstream leans on the charter. Only a human moves a
charter to `active`.
