---
name: faro-repository-impact
description: Locate the real implementation surface for a Requirement Signature using deterministic probes — forming a narrow hypothesis, choosing probes, reading evidence, and expanding one justified architectural hop at a time. Use during /faro-route after the signature is compiled.
---

# Repository impact resolution

The signature says what the work means. This step finds where it actually lives — from
evidence, not from resemblance.

> Start from the narrowest surface the signature implies. Probe it. Expand only where a
> direct dependency justifies the hop. Stop when no supported path remains.

The failure this prevents is concrete: a route that reads a whole service because the
requirement mentioned a word that appears in it.

## Form the hypothesis first

Write the hypotheses into the investigation **before** probing. A hypothesis recorded
afterwards is a conclusion in disguise, and the evidence trail stops meaning anything.

A good starting hypothesis names one thing: *the identity contract that defines duplicate
handling*, *the provider interface every integration implements*, *the SDK package manifest
that declares compatibility*. A bad one names a service.

## Choose probes from the hypothesis

| To learn | Probe | Query |
|---|---|---|
| what this repository even is | `repository_discovery` | — |
| where a contract is defined | `contract_search` | the type or interface name |
| who implements it | `implementation_search` | the same name |
| where implementations get wired in | `registration_search` | the interface name |
| who depends on a module | `consumer_search` | the module's path |
| who imports or includes a module | `reference_search` | the module path or package name |
| where a name appears at all | `identifier_search` | the identifier |
| what already tests this | `test_discovery` | optionally the identifier |
| whether stored state is involved | `migration_discovery` | — |
| how it is configured | `configuration_discovery` | optionally the identifier |
| what is published, and at what version | `manifest_inspection` | — |
| whether someone is mid-change here | `working_tree_status` | — |

Not every route runs every probe. Run the ones your hypothesis needs; a probe with no
question behind it is context spent for nothing.

## Read the evidence honestly

Probes return **paths, line numbers, and content hashes — never file content**. That is
deliberate: a probe cannot leak a credential it happened to match. Read a file yourself when
you need to understand it; the probe tells you where to look and records that you looked.

Three things in a probe result matter as much as the matches:

- **`limitations`** — what the probe could not see. `consumer_search` says outright that it
  cannot see consumers reached through dependency injection. A route that ignores a stated
  limitation is more confident than its evidence.
- **`match_count: 0`** — real evidence. A contract that does not exist means the hypothesis was
  wrong, and the requirement may be asking for something new rather than a change.
- **`secret_suspected`** — a file that looks like it holds credentials. Never read it into the
  route; note the credential boundary instead.

Record what you ruled out in `rejected_candidates` with the reason. A route reviewer needs to
know that `services/scoring` was *considered and excluded*, not merely never looked at.

## Expansion — one hop, with a reason

Every expansion is an entry in `expansions` naming what it went from, what it went to, the
justification, and the probe that supports it.

**A hop is justified by:**

- a direct import or dependency edge a probe actually matched
- an interface the target implements or defines
- a composition root that wires the surface in
- a test that asserts the behaviour under change
- a migration or stored-state contract the change would alter

**A hop is not justified by:**

- the same words appearing in both places
- being in the same service or directory
- "it might be affected"
- wanting more confidence

Set `beyond_initial_hypothesis: true` when a hop leaves the capability boundary the
investigation started from. That is not a failure — it is often the most valuable thing an
investigation finds — but it forces human approval, because a route that grew past its own
premise is exactly the one worth a second pair of eyes.

## Confidence comes from evidence, not from effort

- **high** — the contract exists where expected, implementations and consumers are identified,
  ownership is clear, no stated limitation undermines the scope.
- **medium** — the surface is located but a boundary is uncertain: an unresolved consumer, a
  registration you could not confirm, a probe limitation that matters.
- **low** — the expected surface is missing, ownership is unclear, or evidence conflicts.

**Low confidence is not solved by reading more.** Widening the scan to compensate for not
understanding the requirement produces a route that authorises everything and explains
nothing. Record the ambiguity, name the stop condition, and let a human resolve it.

## Never

Do not modify a repository. Do not run project scripts, builds, or tests. Do not read outside
a registered repository root — the toolkit refuses it, and trying is a sign the hypothesis is
wrong. Do not treat git history as implementation truth: the working tree is what exists now.
