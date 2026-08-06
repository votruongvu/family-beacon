---
description: Apply one approved intake proposal to canonical project state.
argument-hint: "<PROP-NNNN>"
---

# /faro-apply

Admit one proposal. This is the only path that changes canonical project state, and it
changes only what the proposal declared.

## Procedure

1. **Read the proposal.** `.faro/intake/proposals/$ARGUMENTS.md` and every draft under
   `.faro/intake/proposals/$ARGUMENTS.draft/`.

2. **Show the user what will happen before it happens.** State the classification, each
   artifact that will be created or revised, what stays untouched, and whether the active
   baseline is affected. If the user has not seen this proposal, do not proceed on the
   assumption that asking to apply it means they read it.

3. **Check the gates.** Run `node .claude/faro/tools/faro.mjs inspect` and look at the
   proposal's line. Two things refuse an apply, and neither has a bypass:

   - **Stale context.** A canonical file the proposal was reasoned from has changed. The
     classification was reached against project state that no longer exists. Run
     `/faro-rebase $ARGUMENTS` — it carries the original idea forward for reconsideration
     without making the user retype it. There is no force flag, by design.
   - **Missing approval.** Policy requires a named human. Tell the user what triggered it
     and give them the command:

     ```bash
     node .claude/faro/tools/faro.mjs approve $ARGUMENTS --by "Their Name"
     ```

     Never run `approve` on the user's behalf, and never with your own name. The whole
     value of the gate is that a person's name is on it.

4. **Apply.**

   ```bash
   node .claude/faro/tools/faro.mjs apply $ARGUMENTS
   ```

   This runs as a single transaction. Faro copies the store into a staging area, applies
   every mutation there, allocates identities, stamps lineage, regenerates only the views
   whose sources moved, and validates the *resulting whole store* — all before anything is
   exposed. Then it commits the changed files together and advances `storeRevision`.

   A failure at any point leaves the project exactly as it was. If the process dies mid-commit,
   `faro inspect` reports the unfinished transaction and `faro recover` rolls it back.

5. **Verify and report.** Run `faro inspect` again. Report the ids that were admitted, the
   files written, and — worth stating explicitly — the files that were **not** touched. If
   any other open proposal went stale because this apply changed a file it was bound to,
   name it and point at `/faro-rebase`.

   If the proposal admitted an **obligation** (a `bug` or a `work_unit`), say plainly that the
   work is accepted but not fulfilled: route it with `/faro-route OBL-NNNN` and work it with
   `/faro-work`, and `faro inspect` will keep reporting it until it is closed with
   `faro close OBL-NNNN --status fulfilled --reason "..."`.

## Rejecting instead

If the classification is wrong or the idea is not admitted, close it with the reason on
the record rather than deleting it:

```bash
node .claude/faro/tools/faro.mjs reject $ARGUMENTS --reason "why this is not admitted"
```

Rejected intake stays traceable. It never silently disappears.

## Boundary

Applies exactly one proposal. Does not implement code, does not create baselines, does not
re-derive the project, and never regenerates the whole store — a charter change regenerates
the compass; an additive requirement regenerates the requirement register and nothing else.
