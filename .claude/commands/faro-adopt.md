---
description: Map existing material — a requirements brief, design documents, or a whole repository — into a reviewable set of ordinary Faro proposals, and stop before approval.
argument-hint: "[source paths — docs/PRD.md README.md — or the brief itself, pasted inline]"
---

# /faro-adopt

Turn a body of existing material into project truth. That material is usually a repository with
code, documents, and work in flight — but it does not have to be. A brand-new project whose only
input is a requirements brief goes through exactly this command, and so does a brief the user
types straight into the conversation.

Use it whenever there is **more than one item** to land. One idea at a time is `/faro-intake`; a
ten-page brief through `/faro-intake` is thirty sequential classifications of the same document.

**You produce proposals. You never approve them and never apply them.** Adoption ends with a set
of ordinary intake records and proposals a human still has to read — the same artifacts
`/faro-intake` produces, through the same mechanisms.

Arguments: `$ARGUMENTS` — either paths the user considers authoritative, or the brief itself in
plain language.

- **Paths** are tier-2 sources. Treat them as authoritative and still explain your selection.
- **Inline prose** is a tier-1 source — an explicit user statement, the strongest evidence of
  intent there is. Capture the user's words verbatim into the intake record before decomposing
  them, exactly as `/faro-intake` does, so what they actually said survives your paraphrase.
- **Neither** means discover candidates yourself.

A project with no code is not a reason to refuse. Tiers 3 to 5 — manifests, working tree, git
history — are simply absent, and everything the brief states is intended direction rather than
implementation evidence. That makes adoption *easier*, not inapplicable: the hardest judgement in
this command is separating what code does from what a project agreed to, and a greenfield brief
has none of it.

## Before you start

```bash
node .claude/faro/tools/faro.mjs inspect
```

Refuse, and say which applies:

| Condition | What to tell the user |
|---|---|
| no `.faro/` store | run `/faro-init` first — adoption fills a project in, it does not create one |
| the project is invalid | fix what `inspect` reports; adoption must not build on a broken store |
| an unresolved transaction | run `faro recover` before anything else |

If the project already holds admitted requirements, decisions, or knowledge, adoption still runs —
but that truth is authoritative. Propose only what is missing, and never restate what is there.

## Procedure

### 1 · Choose the sources, and say so

Follow the **`faro-existing-project-adoption`** skill. It owns source authority, the default
candidates, the default exclusions, and what is worth capturing.

Report the selection before drafting anything — selected sources with one line each on why they
matter, the categories you excluded, and any document whose authority you could not confirm. Not a
file listing.

Git history and whole source trees are excluded by default; they stay unread unless the skill's
stated exceptions apply, and you say which one and why.

### 2 · Draft the current project truth

Charter, knowledge, active requirements, governing decisions, open obligations — only what is
still active, grounded in a source you named.

The charter has one narrow exception: a blank `/faro-init` draft may be refined in place. The
conditions are in the skill, and they are exact. Anything else is an ordinary
`project_charter_change` proposal, which always needs a named human.

### 3 · Write ordinary intake records and proposals

```bash
node .claude/faro/tools/faro.mjs next-id intake
node .claude/faro/tools/faro.mjs next-id proposal
node .claude/faro/tools/faro.mjs bind PROP-NNNN <store-path>...
```

One primary classification per proposal, carrying only the operations that classification allows —
the grouping table is in the skill. Bugs and work units cannot share a proposal.

Bind each proposal to the `.faro/` files you actually read while classifying it. External
documents cannot be bound; they belong in each draft's `provenance` and in the proposal's
`## Reasoning`.

Adoption creates no new artifact type, no adoption registry, and no `.faro/` directory. If you find
yourself wanting one, the answer is a proposal.

### 4 · Report and stop

End with the report below and nothing after it. Then stop — no `approve`, no `apply`, no charter
activation without the user saying so in as many words.

```markdown
## Existing material mapped

**What Faro understood**
- <Current project purpose or direction>
- <Important active delivery or boundary>
- <Important implementation fact, when there is an implementation>

**Proposed project truth**
- <Number and summary of Requirements>
- <Number and summary of Decisions>
- <Number and summary of Knowledge items>
- <Number and summary of open Obligations>

**Needs confirmation**
- <Material uncertainty or conflict>

**Intentionally not imported**
- Historical or closed work
- Deprecated or archived documents
- Unconfirmed behaviour found only in code

**Proposals ready**
- `PROP-NNNN` — <human-readable purpose>

**Result**
ADOPTION PROPOSALS READY

**Next step**
Review the proposals, approve the ones that are correct with `/faro-approve PROP-NNNN`, then run
`/faro-apply PROP-NNNN` for each in the recommended order.
```

Omit any section with nothing in it. Keep hashes, schema fields, and validation output out of it —
the only internal identifiers are the `PROP-NNNN` ids the user needs to act. It must be useful
pasted straight into a ticket.

When direction is missing rather than merely incomplete, say so plainly and name what only the
user can supply. `ADOPTION PROPOSALS READY` is not the only honest ending.

## Boundary

`/faro-adopt` reads a bounded source set and writes intake records, proposals, and their draft
artifacts. It never approves a proposal, never runs `faro apply`, never activates the charter
without explicit confirmation, never edits an admitted requirement, decision, knowledge item, or
obligation, never reads git history or a full source tree by default, and never creates an
adoption record type of any kind. Canonical state still changes only through `/faro-apply`.
