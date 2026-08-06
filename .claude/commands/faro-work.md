---
description: Implement and verify one approved route contract on its own branch, with logical commits, and report what changed.
argument-hint: "<ROUTE-NNNN> [--verify-only]"
---

# /faro-work

Take one approved Route Contract, do the work it authorises on a branch of its own, commit it in
coherent parts, and hand back a short report the user can paste anywhere. The user's only
remaining action is their normal **Sync / Push**.

This command orchestrates; the roles it invokes hold the detail. **`faro-implementer`** owns how
the change is made and committed, **`faro-verifier`** owns how it is checked. Neither is restated
here, because a rule written in two places will eventually disagree with itself.

Arguments: `$ARGUMENTS` — a route id, optionally followed by `--verify-only` to run the Verifier
alone against work that already exists.

## Procedure

### 1 · Resolve the boundary

```bash
node .claude/faro/tools/faro.mjs route-boundary ROUTE-NNNN
```

This is the gate, and it is deterministic. It can end two different ways, and only one of them
is a refusal. A **refusal** is an error code and no boundary at all — **refuse to continue**, and
report the code rather than working around it:

| Refusal | Meaning |
|---|---|
| `ROUTE_NOT_FOUND` · `INVALID_ID` | no such route |
| `ROUTE_INVALID` | it fails its own schema, or its facts contradict its scopes |
| `ROUTE_NOT_APPROVED` | draft, awaiting review, rejected, or superseded |
| `ROUTE_APPROVAL_PENDING` | policy requires a named human who has not approved it |
| `ROUTE_APPROVAL_UNDERSTATED` | the route's own facts require approval it did not claim |
| `ROUTE_STALE` | something it rests on moved *outside* its write scope |
| `ROUTE_NOT_RECONSIDERED` | rebased, and its scope and confidence were never re-examined |
| `ROUTE_NO_WRITE_SCOPE` | it authorises no change — the ambiguity blocking it is unresolved |
| `REPOSITORY_MISSING` | a registered repository is not on disk |
| `CROSS_REPOSITORY_WRITE` · `NO_WORK_REPOSITORY` | at step 2 or at a commit: the write scope spans two repositories, or names none |

Never grant the approval yourself, never edit the route to get past a refusal, and never route
the item again just to obtain a friendlier contract.

Otherwise the route is usable and the command prints a **verdict** on what the working tree
already does to it. Anything but `clear` exits non-zero, so the exit code alone does not tell you
which of the two you are looking at — read the verdict:

| Verdict | Meaning | What to do |
|---|---|---|
| `clear` | nothing already in the way | continue |
| `overlap_requires_confirmation` | uncommitted work already sits inside the write scope | ask the user whether it belongs to this work; never stash, reset, or discard it |
| `base_unresolved` | committed work could not be inspected, because the range is unknown | re-run with `--base <ref>`; do not read it as clean |
| `scope_violation` | a protected or excluded path has already been changed | stop until that is resolved |

The two middle verdicts describe a tree that has not been worked yet. With `--verify-only` the
work already exists, so neither is a reason to stop: skip to step 4, where the Verifier reads
scope with `scope-check` against the diff itself.

### 2 · Settle the tree, then create the branch

**A new branch needs a clean tree.** If anything is uncommitted, stop and say so — the user
decides whether to commit it, set it aside, or work elsewhere. **Never** stash, reset, clean,
check out over, or discard anything. The base branch is the user's choice, made before running
this: do not switch to one you think is better. `branch-start` refuses a dirty tree, a name that
already exists, and switching away from another Faro work branch; those refusals are the answer,
not an obstacle.

Show the name before creating it:

```bash
node .claude/faro/tools/faro.mjs branch-start ROUTE-NNNN --title "add huawei cloud sync" --dry-run
```

Four **types** are derived from the route's own evidence, and only those four:

```text
an obligation of kind bug, or a correction intent            → fix
a documentation intent, or an all-documentation write scope  → docs
an all-test write scope                                      → test
anything else                                                → feat
```

`perf`, `refactor`, `ci`, `build`, and `chore` are never inferred — the route records intent, not
technique, so those only ever come from an explicit `--type`.

Override with `--type` only when the real intent differs from what the route recorded, and say why
— a genuinely changed intent means the **route** needs reconsidering, not the branch name. Do not
choose `chore` merely because the work is technical. The **title** names the outcome in lowercase
hyphenated words (`add-huawei-cloud-sync`); the toolkit refuses one made only of vague words, so
write what the work achieves, not that work happened. The **work id** comes from the route's
source automatically (`req-0006`); pass `--work-id us-0042` when the team's tracker owns another.

Drop `--dry-run` to create the branch, and **record the base it reports**:

```text
  base        main at 4f2c1ab
```

That base branch and base commit are the handoff to the Verifier — carry them through the rest of
the run. When no base is passed the toolkit infers one — an upstream naming another branch, or a
single `main` or `master` — and raises `AMBIGUOUS_BASE` rather than review a guessed range. Only
`--working-tree-only` narrows verification to uncommitted work, and once the work is committed
there is none.

### 3 · Implement

Invoke the **`faro-implementer`** skill and follow it. It commits each coherent part as that part
is finished, and every path is checked against the route before anything is staged, so a file the
route never authorised cannot enter history. Add no implementation guidance here: if the route
leaves the work ambiguous, that is a route deficiency, not something this command decides.

### 4 · Verify

Invoke the **`faro-verifier`** skill and follow it, **handing it the base from step 2**. The
Verifier re-reads the route independently and inspects the committed and the uncommitted diff
together; committed work is invisible without that base.

In `--verify-only` mode there was no step 2, so pass the base explicitly whenever it is known —
the user named it, or the branch has an upstream. When it cannot be determined the toolkit raises
`AMBIGUOUS_BASE`; report that and stop rather than guessing a range.

### 5 · Route the outcome

| Result | When | What this command does |
|---|---|---|
| `READY TO SYNC` | scope respected, required checks run and passed | report — the user just syncs |
| `NEEDS CORRECTION` | a required check failed, or a change fell outside scope | if the correction stays inside the route's scope, hand back to the Implementer on the same branch and verify again; otherwise the row below |
| `ROUTE UPDATE REQUIRED` | the work genuinely needs something the route does not authorise | stop, keep the branch and its valid commits, and ask for an amendment via `/faro-route-rebase` |
| `BLOCKED` | a required check could not run — no sandbox, no credentials, no dataset | stop, and name the obligation left uncovered |

More than one result can be true. Say so; do not pick the most flattering.

### 6 · Report

End with the report below and nothing after it. It must stand on its own as plain text: a reader
who has never opened the route or the code should understand what happened. Keep internal
identifiers, hashes, probe ids, schema fields, and command output **out** of it, and name the
route id only if the user needs it for the next step.

```markdown
## Work completed

**Goal**  
<One or two sentences describing the requested outcome.>

**What changed**
- <Meaningful change>
- <Meaningful change>

**Kept unchanged**
- <Important protected or intentionally excluded area>

**Verification**
- <Human-readable check and result>
- <Human-readable check and result>

**Git**
- Branch: `<branch-name>`
- Commits:
  - `<commit subject>`
  - `<commit subject>`

**Result**  
<READY TO SYNC | NEEDS CORRECTION | ROUTE UPDATE REQUIRED | BLOCKED>

**Next step**  
<One clear action for the user.>
```

Omit **Kept unchanged** when it would add nothing. When work stopped, title it `## Work stopped`,
replace **What changed** with **Completed**, and add **Blocked by**.

A specialist challenge the Verifier reports is **never dropped**: state it in **Verification** in
plain words and carry it into **Next step**. Deterministic checks passing does not discharge it,
and nobody in this session is authorised to perform it.

## Boundary

`/faro-work` changes repository files inside one approved write scope, creates one branch, and
makes commits. It never publishes, and that is structural rather than a promise: Faro's single git
entry point refuses `push`, `merge`, `rebase`, `reset`, `clean`, `stash`, `remote`, `config`,
`cherry-pick`, `revert`, `--force`, and `--no-verify`, so no pull request, tag, release, deployment, or discarded change
can come out of this command. Neither role restates that list, and neither may reach around it
with a raw `git` command to publish or discard anything — reading the repository with `git`, which
is how the Verifier reads the diff, is expected.

Nothing is written to `.faro/` — no session, no workspace, no evidence store. The report is
conversation output, not a canonical artifact, and it creates no new state. Faro's canonical model
still ends at the approved route: this command approves nothing and closes no obligation.
