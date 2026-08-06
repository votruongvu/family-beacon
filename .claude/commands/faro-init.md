---
description: Initialize the minimal Faro project store in this repository.
argument-hint: [project-name]
allowed-tools: Bash(node .claude/faro/faro.mjs:*), Read
---

# /faro-init

Initialize Faro in the current repository so a Project Charter can be
established afterwards.

Requested project name (may be empty): $ARGUMENTS

## What this command does

1. Locates the repository root and refuses to write anything outside it.
2. Creates the minimal store:

   ```text
   .faro/
     project.json
     charter/
       history/
   ```

3. Writes project metadata with Charter status `missing`.
4. Tells the user to run `/faro-charter`.

It is idempotent and never overwrites an existing Faro project.

## What this command does not do

- It does **not** create a Charter, a Charter draft, or a placeholder Charter
  file. `.faro/charter/current.md` stays absent until the first Charter is
  confirmed through `/faro-charter`.
- It does **not** scan the repository, its source code, or its Git history.
  Only a clear existing manifest may supply a project name.
- It does **not** create records, registries, or scaffolding for anything else.

## Steps

**1. Run the toolkit.**

With a name argument:

```bash
node .claude/faro/faro.mjs init "<project-name>"
```

Without one (the toolkit derives a sensible name from a clear manifest or the
directory name):

```bash
node .claude/faro/faro.mjs init
```

**2. Read the JSON result.** It reports `created`, `already_initialized`,
`project`, and `charter`.

**3. Report concisely.**

First initialization:

```markdown
## Faro initialized

**Project**
<project_name>

**Charter**
Not established

**Next step**
Run `/faro-charter` with a product brief, raw requirements, notes, or other project materials.
```

Already initialized (`already_initialized: true`) - report the current state and
change nothing:

```markdown
## Faro already initialized

**Project**
<project_name>

**Charter**
Not established        (or: Active, version <n>)

**Next step**
Run `/faro-charter` to establish the Product North Star.
```

When the Charter is already active, say so and offer `/faro-charter` for adding
context or revising direction.

**4. On error**, show the `error.message` from the JSON and stop. Do not create
files by hand and do not repair the store manually.
