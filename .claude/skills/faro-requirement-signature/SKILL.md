---
name: faro-requirement-signature
description: Compile one admitted requirement version or accepted obligation into a Requirement Signature — intent, constraints, acceptance topics, cross-cutting concerns, and routing-oriented risk characteristics. Use at the start of /faro-route, before any repository probe runs.
---

# The Requirement Signature

A signature is what one admitted item means **in execution terms**. It is the bridge between
a requirement written for humans and a route that has to name files.

It is compiled from an **exact immutable source** — `REQ-0004@1` or `OBL-0001` — and bound to
that source's content hash. A signature for "the latest version" would silently change meaning
when the requirement was revised.

## What a signature is not

**It holds no repository findings.** No paths, no modules, no file names. Those belong to the
investigation. A signature that named files would expire every time code moved, and it would
have decided the route before any evidence was gathered.

**It adds no facts the source does not have.** If the requirement never said which provider
API to use, the signature does not either — that becomes an ambiguity or a routing hint, never
a constraint.

## Compiling it

**Intent.** One `type` from `capability · integration · correction · constraint ·
compatibility · documentation · migration`, and an `outcome` that a reader could check the
finished work against. `capability_topics` are the vocabulary the repository will be searched
with — the nouns of the domain (`source identity`, `oauth lifecycle`, `provider ingestion`),
not module names you are guessing at.

**Alignment.** Objectives, deliveries, milestones — copied from the source, not re-derived. If
the requirement contributes to three deliveries, the route is cross-cutting and that starts
here.

**Constraints.** `mandatory` are the rules the work must satisfy: charter principles that
bind, decisions that constrain the approach, acceptance criteria that are non-negotiable.
`prohibited_assumptions` are the things a later implementer might reasonably assume and must
not — "assume the provider rotates refresh tokens", "assume identity includes ingestion time".
This field prevents more defects than any other.

**Acceptance topics.** What a later implementation must *demonstrate*, phrased as topics
rather than tests. Each verification obligation in the route will trace back to one of these,
so a topic nobody can verify is a topic worth questioning now.

**Cross-cutting concerns.** Security, privacy, identity, provenance, migration, public API,
observability — whichever genuinely apply. These drive both isolation and specialist review.

**Risk characteristics.** Six axes, each `low · medium · high`:

| Axis | Ask |
|---|---|
| `blast_radius` | how much breaks if this is wrong? |
| `uncertainty` | how much do we not know yet? |
| `irreversibility` | can it be undone after it ships? |
| `data_sensitivity` | does it touch personal or health data? |
| `external_dependency` | does it depend on a system we do not control? |
| `statefulness` | does it change stored state or its meaning? |

These are the input to isolation. Rating everything `high` makes the route useless in a
different way than rating everything `low` — both stop the recommendation from meaning
anything.

**Routing hints.** Where to *start looking*, explicitly as hypotheses: `known_analogues` (the
existing Fitbit integration), `expected_contracts` (`ProviderSource`), `expected_tests`,
`likely_repositories`. A hint that turns out to be wrong is recorded as a rejected candidate
in the investigation — that is useful evidence, not a failure.

**Explicit exclusions.** At least one, always. What this requirement is *not*, in the terms
someone might mistake it for: "not a native on-device bridge", "not a change to scoring". This
is what keeps the route from drifting outward.

**Ambiguities.** Anything the source does not settle. An ambiguity here becomes a stop
condition in the route rather than a guess in the code.

## Obligations compile too

A `bug` obligation compiles as `intent.type: correction`. Its outcome is the accepted
behaviour being restored — not a new behaviour — and its acceptance topics usually restate the
contradicted requirement's criteria deliberately. A `work_unit` compiles as whatever its
parent requirement is about, scoped to the step.

## When a signature goes stale

A requirement version is immutable, so a signature bound to one stays fresh unless the file is
tampered with. An obligation is mutable: closing it makes the signature stale, which is
correct — a fulfilled obligation should not still be routable.
