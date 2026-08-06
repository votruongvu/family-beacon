# Working on Faro

Guidance for changing this repository. To *use* Faro, read [README.md](README.md).

`.claude/` is the whole distribution: `commands/` (slash commands), `skills/` (the reasoning),
and `faro/tools/` (the deterministic toolkit). It must never depend on anything outside itself
— a skill citing a path in this repository is a defect, because its reader will not have this
repository.

The toolkit is ~8,200 lines: `faro.mjs` (the CLI — argument parsing, output, exit codes)
over 18 modules in `lib/`. What owns what:

```text
model.mjs         every schema, vocabulary, required section, both approval policies,
                  and FIELD_ORDER — start here for the shape of any artifact
store.mjs         reading and writing one canonical item · id allocation · project.json
transaction.mjs   stage → validate whole store → commit, and rollback
apply · rebase    admitting a proposal · carrying a stale one forward
inspect.mjs       validation, the health report, and transaction recovery
views.mjs         generated projections and their builders
migrate.mjs       schema v1 → v2
routing.mjs       signatures, investigations, routes · binding and freshness
probes.mjs        the twelve read-only repository probes
repositories.mjs  registered roots, and the refusal of any path that leaves one
execution.mjs     route workability · scope classification · changed paths
gitflow.mjs       branch naming and safety · commit validation · branch base and changed
                  paths · the git entry point
schema.mjs · frontmatter.mjs · fs-safe.mjs · errors.mjs · init.mjs   the plumbing
```

## The line between Claude and code

**Skill** when the answer needs judgement: what classification an input is, what belongs in a
charter, how far impact reaches, whether a route's scope is right.

**Toolkit** when the answer must be identical every time: identity allocation, schema
validation, hashing, atomic writes, approval policy, scope classification, view rendering.

The test is whether Claude would get it wrong or inconsistently right. If Claude handles it
well, a script reimplementing it is cost with no benefit. The reverse is also true: an approval
gate that depends on judgement is not a gate.

## Boundaries

Load-bearing. Each is here because removing it collapses something else — the reason is stated
with the rule, because a rule without its reason gets argued away.

**One canonical home per concept.** A second file answering the same question is a defect. Name
the question before adding a file to `.faro/`.

**Generated views are never authoritative.** They carry a do-not-edit notice and rebuild from
source. A new view needs a builder in `views.mjs` with `source_bindings` — a view that cannot
report its own staleness should not exist.

**Immutable history.** `requirements/REQ-NNNN/vN.md` and `decisions/DEC-NNNN/vN.md` are never
edited after they are written. A superseded charter is archived to `charter/_history/`.

**Delta impact is the product.** Admitting one requirement touches that requirement, its
proposal, and the register — nothing else. If an additive admission reaches the charter or the
compass, that is a bug. Snapshot `.faro/` before and after an apply and diff it.

**Adoption imports evidence, not authority.** `/faro-adopt` reads an existing repository and
writes ordinary intake proposals, then stops — approval and apply stay where they are, because a
bulk import that admitted itself would put unreviewed truth behind the gates that protect
reviewed truth. Existing code is implementation truth; it becomes requirement truth only where an
accepted document or the user confirms it, and otherwise it is knowledge with `repository`
provenance. Active Faro truth is never overwritten by an import — adoption proposes against what
is already admitted, like any other input. Source selection is bounded, with git history and
whole source trees excluded by default, because reading everything produces a backlog rather than
the project's current direction.

**Project-truth mutation goes through a transaction.** Anything that writes several artifacts at
once or advances `storeRevision` — apply, rebase, route-rebase — stages into `.faro/.txn/`,
validates the whole staged store, then commits, because a failure must leave the prior state
byte-identical; `FARO_TEST_FAIL_AT` injects one at each phase boundary. A single-record workflow
decision — granting approval, recording a binding, rejecting — is a validated atomic `writeItem`
to the one file it concerns, where there is no partial whole for a transaction to protect.

**Staleness is computed, never flagged.** Freshness is derived from bound hashes at read time.
A flag that must be flipped is a flag that rots. Stale is *refused*, and there is no force flag
— rebase carries the reasoning forward and forces reconsideration, because a moved source can
change what an input is.

**Approval reads facts, never prose.** `requiredApproval()` takes `semantic_facts`, the
classification, and the confidence. `requiredRouteApproval()` works the same way over
`route_facts`. Wanting to inspect a title to decide severity means adding a fact to the contract
and bumping its version.

**Probes never classify, and never leak.** A probe returns paths, line numbers, and hashes —
never file content, so it cannot disclose a credential it matched. It must not score similarity
or rank relevance. Every probe reports what it could not see; silent truncation is a defect.

**Routing is read-only.** Nothing in `probes.mjs`, `routing.mjs`, or `execution.mjs` writes to a
repository, runs a project script, or reads outside a registered root.

**Scope denial beats scope grant.** A path is forbidden when any protected or excluded entry
covers it, however specific the write entry that also covers it is. A route contradicting itself
stops the work and asks for an amendment — the tool never resolves it in its own favour.

**Working from a route stores nothing in `.faro/`.** `execution.mjs` answers four questions: is
the route workable, which paths changed — committed since the branch base, staged, unstaged, and
untracked — are they inside the write scope, and did anything protected or excluded change. The
Implementer and Verifier are prompts holding no state; their report is conversation output.
Anything needing a status, a freshness rule, or a view is the execution runtime this design
refuses.

**Faro writes to git, never to a remote.** `gitflow.mjs` creates one branch and makes commits
through a single git entry point that refuses `push`, `merge`, `rebase`, `reset`, `clean`,
`stash`, `remote`, `config`, `cherry-pick`, `revert`, `--no-verify`, and `--force`. That refusal is structural because
"Faro must not push" is a guarantee only when no code path pushes. Git is the whole operational
state — no branch registry, no commit registry.

**A name is refused for emptiness, not style.** A branch title or commit subject whose words are
all vague (`update-code`, `chore: update files`) is rejected in code. Whether a well-formed name
is *accurate* is judgement and stays with Claude.

**Byte-stable output.** Proposals and views bind to hashes, so incidental reordering reads as a
material change. New front-matter fields go in `FIELD_ORDER` in `model.mjs`.

## Conventions

- ESM, `.mjs`, JSDoc types. No TypeScript, no bundler, no dependencies.
- Node 22+, standard library only. Adding a dependency needs a reason worth writing down here;
  there has not been one yet.
- Errors are `FaroError` with a stable code, a one-sentence message, and an actionable hint.
  Stack traces only under `FARO_DEBUG=1`.
- Paths through `node:path`; store-relative paths are POSIX strings converted on use.
- All writes UTF-8 and atomic. Nothing under `.faro/` is written through a symlink leaving it.
- Timestamps come from `now()`, which honours `FARO_NOW`.
- Everything in English: code, comments, schemas, commands, skills, generated output.

## Verifying a change

```bash
npm test    # tests/smoke.mjs, then tests/safety.mjs
```

`tests/smoke.mjs` walks one project from `init` to a committed branch and holds nothing but that
walkthrough. It asserts the things that fail *silently*: which files an operation touched, which
refusals actually refuse, and what the exit code was. Add a case when you add a boundary; do not
grow it into a suite.

`tests/safety.mjs` asks the other question: when something goes wrong, does Faro still refuse the way
it promises to? One check per invariant that protects project truth or the user's repository — a
transaction that dies mid-commit, a source that moved under a proposal, a hook that rejects a
commit, a path that leaves its repository. It is the file to extend when you add a refusal, and
the one to run a deliberate mutation against: break the guarantee in the toolkit, confirm the
check goes red, put it back. A check that stays green under that is testing nothing.

`tests/harness.mjs` is the one home for what a test file needs: the tally, the CLI and git runners, the
temporary repository, the `.faro/` snapshot, and the two fixtures. It is a harness, not a
framework — no discovery, no lifecycle, no reporter, and it never calls `process.exit` for you.

Every temporary repository it creates writes its identity and signing settings with `--local`,
never global and never system, and the git runner injects no `-c user.name`. A CI runner and a
fresh laptop have neither a git identity nor a signing key, so a test that only commits because
the developer happens to have a `~/.gitconfig` is a test that lies — and one that passes only
because the runner injects an identity Faro itself never passes proves nothing about `faro
commit`. Check that it still holds by running against a host with nothing configured:

```bash
env HOME=/tmp/no-home GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null npm test
```

For a change to `.claude/faro/tools/`, also parse-check, since a syntax error in an unexercised
branch will not surface otherwise:

```bash
for f in .claude/faro/tools/faro.mjs .claude/faro/tools/lib/*.mjs; do node --check "$f"; done
```

Exercise the path you changed through the real CLI, never by importing a module in isolation —
argument parsing, error rendering, and exit codes are where the defects have been. `--keep`
leaves the temp projects on disk to inspect. `FARO_NOW` pins timestamps; `FARO_TEST_FAIL_AT`
injects a deterministic transaction failure at `after-stage`, `after-validate`, `during-commit`,
or `crash-during-commit`.

Two things stay unverifiable by construction: classification is judgement, not a fixed result,
and so is whether a route's scope is *right*. What can be checked is shape — allowed values,
required evidence, approval gates, relationship integrity, and which files an operation touched.

## What not to build

The two boundaries above already refuse the execution runtime and everything that publishes.
These are the four things that get proposed anyway, each as a small helpful addition:

**An obligation is not a work queue.** Priority, assignment, or ordering builds a scheduler.

**A route is not a plan.** It says what may be touched, how isolated, and what must be proven —
never how to implement anything, in what order, or with which approach.

**A role is not an agent.** The Implementer and Verifier hold no state and run no process. Their
separation exists for one reason: a verifier that can fix what it finds will fix what it finds,
and then it has reviewed nothing. Do not add a third role — a specialist challenge nobody is
authorised to perform is *reported*, never staffed.

**Status lives on the item it describes.** No readiness file, event log, status projection,
event sourcing, repository twin, web UI, or database.
