---
description: Report the current Project Compass, registries, open proposals, and any invalid or stale state.
argument-hint: "[--json]"
---

# /faro-inspect

Answer "where does this project actually stand?" from canonical data, not from memory of
this conversation.

## Procedure

1. **Run the inspector.**

   ```bash
   node .claude/faro/tools/faro.mjs inspect $ARGUMENTS
   ```

   It reports one of three states: `healthy`, `warning`, or `invalid`, and exits non-zero
   when the project is invalid.

2. **Read `.faro/views/PROJECT_COMPASS.md`** so you can summarise direction in the
   project's own words rather than as counts.

3. **Interpret, don't just relay.** The raw output is accurate but flat. Say what it means:

   | Finding | What it means | What to do |
   |---|---|---|
   | `CHARTER_DRAFT` | direction is not agreed; every classification rests on it | fill in the charter, then set `status: active` |
   | `VIEW_STALE` / `VIEW_MISSING` | a generated view no longer matches its source | you regenerate it with `faro render` |
   | `PROPOSAL_STALE` | a proposal's reasoning expired when a bound file changed | `/faro-rebase <id>` |
   | `REBASE_PENDING` | a rebased proposal has not been reconsidered yet | `/faro-rebase <id>` |
   | `OBLIGATIONS_UNROUTED` | accepted bugs or work units that are still open | `/faro-route <id>`, then `/faro-work`; close a finished one with `/faro-close <id>` |
   | `TRANSACTION_PENDING` | a commit was interrupted | you roll it back with `faro recover` |
   | `TRANSACTION_UNRESOLVED` | the store changed under an in-flight commit | resolve by hand; Faro will not guess |
   | `APPROVAL_PENDING` | a proposal is waiting on a named human | `/faro-approve <id>` |
   | `SCHEMA_INVALID` / `BROKEN_REFERENCE` | a canonical file is malformed or points at nothing | fix the named field; the path and field are in the message |

   Recommend the `/faro-*` commands to the user — those are the whole surface they drive Faro
   through. `faro render`, `faro recover`, `faro migrate`, and `faro verify` are maintenance
   verbs **you** run through the toolkit; never tell the user to type them.

4. **Recommend one next action.** Errors before warnings; an unfinished transaction before
   anything else. If the project is healthy and there are no open proposals, say so plainly —
   "nothing to do" is a real answer.

   One thing never counts as done: **an open obligation**. It stays open until somebody closes
   it with `/faro-close`, so if any exist the project has outstanding work, however healthy the
   store is. Say that.

## Boundary

Read-only. `/faro-inspect` never fixes what it finds — not even a stale view. It reports and
recommends; regenerating a view, `/faro-intake`, and `/faro-apply` change things.
