---
description: Explain one route contract — its scopes, evidence, confidence, and whether it is still usable.
argument-hint: "<ROUTE-NNNN>"
---

# /faro-route-inspect

Answer "can this route be handed to execution, and what exactly does it authorise?"

## Procedure

1. **Check the register first.**

   ```bash
   node .claude/faro/tools/faro.mjs inspect
   ```

   The Routes section shows status, confidence, isolation, write-target count, approval, and
   whether the bindings are still fresh.

2. **Read the route and its evidence.** `.faro/routes/$ARGUMENTS.md`, the signature it
   compiled, and the investigation that grounds it. The investigation is where "why this
   scope and not a wider one" is actually answered.

3. **Report what it authorises, in this order.** Scope before confidence — a reader needs to
   know what the route lets someone do before they weigh how sure it is:

   | | |
   |---|---|
   | **Write scope** | the smallest surface execution may modify |
   | **Protected scope** | what it must not touch without a route amendment |
   | **Excluded scope** | what is deliberately out, and why |
   | **Read scope** | what it may inspect |
   | **Isolation** | the recommended boundary and the risk that implies it |
   | **Verification** | what a later implementation must prove, and what each obligation traces to |
   | **Stop conditions** | what makes execution halt and come back |

4. **State usability plainly.** A route is usable only when it is `approved`, its bindings are
   fresh, and — if it was rebased — it has been reconsidered. Say which of those fails.

   | Finding | Meaning | What to do |
   |---|---|---|
   | `ROUTE_STALE` | a bound project file or repository file changed | `/faro-route-rebase <id>` |
   | `ROUTE_REBASE_PENDING` | carried forward but not reconsidered | `/faro-route-rebase <id>` |
   | `ROUTE_APPROVAL_PENDING` | policy requires a named human | `faro route-approve <id> --by "Name"` |
   | `ROUTE_APPROVAL_UNDERSTATED` | the facts require approval the route did not claim | fix the route; it cannot be used as written |
   | `ROUTE_INVALID` | facts contradict the contract's own scopes | fix the named field |

5. **Say what routing still does not do.** Faro's canonical model ends at the approved contract:
   `/faro-work` implements and verifies it, but nothing about that run is stored — the
   verification obligations listed here are what the work must satisfy, not results.

## Boundary

Read-only. `/faro-route-inspect` never approves, rebases, or repairs a route.
