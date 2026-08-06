---
description: Compile one admitted requirement or accepted obligation into a repository-grounded Route Contract.
argument-hint: "<REQ-NNNN@V | OBL-NNNN>"
---

# /faro-route

Turn one admitted item into an explicit execution boundary: what it means, which code it
touches, what may be written, what must not be, how isolated the work has to be, and what a
later implementation must prove.

**This does not implement anything.** It ends at a route contract a human can approve.

## Procedure

### 1. Resolve the exact source

```bash
node .claude/faro/tools/faro.mjs route-source $ARGUMENTS
```

Routing needs an **exact immutable version** — `REQ-0004@1`, not `REQ-0004`. A route bound to
"latest" would silently change meaning. Draft, rejected, superseded, and closed sources are
refused; routing compiles work that has already been admitted.

### 2. Compile the Requirement Signature

Read the source item in full, plus only the project context it genuinely needs: the charter
principles that bind it, the deliveries and milestones it serves, related requirement
versions, applicable decisions, relevant knowledge, and the active baseline if it selects
this requirement.

Follow the **faro-requirement-signature** skill. Then:

```bash
node .claude/faro/tools/faro.mjs next-id signature
```

Write `.faro/signatures/SIG-NNNN.md` and bind it to what you read:

```bash
node .claude/faro/tools/faro.mjs bind SIG-NNNN requirements/REQ-0004/v1.md charter/charter.md ...
```

The signature is compiled meaning. It carries **no repository findings** — those belong to
the investigation, and mixing them would make the signature expire every time code moved.

### 3. Open the investigation with a narrow hypothesis

```bash
node .claude/faro/tools/faro.mjs repos
node .claude/faro/tools/faro.mjs next-id investigation
```

Write `.faro/investigations/INV-NNNN.md` with the hypotheses you are about to test. State
them before probing — a hypothesis written afterwards is a conclusion wearing a disguise.

Start from the **narrowest** surface the signature implies: one contract, one module, one
provider. Not "the ingestion service".

### 4. Probe, narrow to wide

```bash
node .claude/faro/tools/faro.mjs probe contract_search --repo app --query SourceRecordIdentity --record INV-NNNN
```

Follow the **faro-repository-impact** skill. It carries the probe-selection logic and the
rule for expansion.

Probes are read-only and normalized: they return paths, line numbers, and content hashes —
never file content. Read a file yourself when you need to understand it; the probe tells you
where to look and records the evidence.

Every expansion beyond the initial hypothesis goes in `expansions` with its justification and
the probe that supports it. **Direct dependency justifies a hop. Resemblance does not.**

### 5. Synthesise the Route Contract

```bash
node .claude/faro/tools/faro.mjs next-id route
```

Follow the **faro-route-synthesis** skill. Write `.faro/routes/ROUTE-NNNN.md`, then bind it
to both kinds of source:

```bash
node .claude/faro/tools/faro.mjs bind ROUTE-NNNN signatures/SIG-NNNN.md investigations/INV-NNNN.md ...
node .claude/faro/tools/faro.mjs bind-repo ROUTE-NNNN app:services/ingestion/src/contracts/source-record.ts ...
```

Bind the repository files the route actually rests on — the contracts and modules whose
content would change the answer. Binding the whole read scope makes the route expire on any
edit; binding nothing makes it survive changes that invalidate it.

### 6. Validate and report

```bash
node .claude/faro/tools/faro.mjs render routes
node .claude/faro/tools/faro.mjs inspect
```

Report to the user:

- the classification of intent and what the signature compiled
- **which repositories** are involved, and which are explicitly not
- **read / write / protected / excluded** scope, each with its reason
- routing confidence, and what it rests on
- recommended isolation and why the risk characteristics imply it
- verification obligations, and what each one traces to
- ambiguities and stop conditions
- whether human approval is required, and what triggered it

If approval is required, give the user the command and never run it yourself:

```bash
node .claude/faro/tools/faro.mjs route-approve ROUTE-NNNN --by "Their Name"
```

## Boundary

`/faro-route` reads. It never modifies application code, never creates a branch or worktree,
never runs project scripts or tests, and never changes the requirement it compiled. The
repository is implementation truth; routing observes it and stops.
