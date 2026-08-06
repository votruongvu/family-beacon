---
description: Initialise Faro in this repository and create the canonical store.
argument-hint: "[project name]"
---

# /faro-init

Create the canonical `.faro/` store, and stop there. This command builds the skeleton — the
store, the charter file, the generated views — and nothing else. Filling the charter in is
`/faro-charter`, and landing the first requirements is `/faro-adopt` or `/faro-intake`.

The split is deliberate. Everything downstream hangs off the charter, so authoring it is a
deliberate act with the user in the room, not a side effect of setting up a directory.

## Procedure

1. **Check for an existing project.** Run `node .claude/faro/tools/faro.mjs inspect`. If a
   store already exists, stop and report it. Never pass `--force` on your own initiative —
   replacing a store discards the project's direction, and that is the user's call.

2. **Initialise.** Run:

   ```bash
   node .claude/faro/tools/faro.mjs init --name "$ARGUMENTS"
   ```

   Omit `--name` if no name was given; Faro derives one from `package.json` or the
   directory. This writes `project.json`, a draft `charter/charter.md`, and the generated
   views, and validates them before reporting success.

3. **Notice what the repository already carries.** A `README`, `docs/`, an architecture
   document, a brief, a roadmap. **Name them and stop** — do not read them for direction and
   do not draft anything from them. Listing what exists tells the user which command comes
   next; reading it here would author the charter behind their back.

4. **Validate.**

   ```bash
   node .claude/faro/tools/faro.mjs inspect
   ```

   It reports the charter as a draft. That is correct at this point, not a problem to fix.

5. **Report, and route the user to the right next command.** Show what was created, name the
   requirement-like documents you found, and recommend one of:

   | What the user has | Next command |
   |---|---|
   | direction in their head, or a vision or brief document | `/faro-charter` |
   | a brief or existing documents holding several requirements | `/faro-adopt` |
   | an existing repository with code and work in flight | `/faro-adopt` |
   | one single idea to capture | `/faro-intake` |

   The charter stays `draft` and `/faro-inspect` keeps saying so until somebody fills it in.
   Say that plainly rather than leaving it as a warning the user has to interpret.

## Boundary

`/faro-init` creates the store and nothing else. It does not author the charter — that is
`/faro-charter` — and it does not create requirements, decisions, knowledge, or baselines,
which arrive through `/faro-intake` or `/faro-adopt` and are admitted by `/faro-apply`. It
never reads a requirement-like document for content, never passes `--force` on its own
initiative, and never promotes a charter to `active`.
