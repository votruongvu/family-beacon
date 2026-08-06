---
description: Initialise Faro in this repository and draft its Project Charter.
argument-hint: "[project name]"
---

# /faro-init

Create the canonical `.faro/` store and get the Project Charter to a state a human can
agree with. Everything after this — every requirement, decision, and admission — hangs off
the charter, so a charter nobody read is worse than an empty one.

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

3. **Gather charter evidence from the repository.** Read what already exists — `README`,
   `docs/`, an architecture document, the package manifest, recent commit subjects. You are
   looking for stated direction, not inferring it: vision, the problem, deliverable units,
   milestones, explicit non-goals, and who decides things.

4. **Draft the charter.** Edit `.faro/charter/charter.md` directly. Fill the front matter
   with stable ids (`OBJ-01`, `DEL-01`, `MS-01`, `PRN-01`, `SM-01`, `STK-01`) and write the
   `## Vision` and `## Problem` narrative in the body. Follow the **faro-project-compass**
   skill for what belongs in a charter and — more importantly — what does not.

   Mark anything you could not ground in repository evidence. An objective you invented is
   worse than an objective the user has to add: it reads as agreed direction and then
   quietly misroutes every later classification.

   Leave `status: draft` unless the user explicitly confirms the charter is right. Only the
   user promotes it to `active`.

5. **Regenerate and validate.**

   ```bash
   node .claude/faro/tools/faro.mjs render
   node .claude/faro/tools/faro.mjs inspect
   ```

6. **Report.** Show the charter you drafted, name each element you could not ground in
   evidence, and point at the next step: `/faro-intake` for the first idea.

## Boundary

`/faro-init` establishes direction. It does not create requirements, decisions, knowledge,
or baselines — those arrive through `/faro-intake` and are admitted by `/faro-apply`. If
the repository already carries requirement-like documents, mention them and stop; importing
them is a separate act the user should ask for deliberately.
