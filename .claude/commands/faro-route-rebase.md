---
description: Carry a stale route contract onto current project and repository state, reconsidering scope and confidence.
argument-hint: "<ROUTE-NNNN>"
---

# /faro-route-rebase

A route goes stale when something it was derived from changes — the compiled requirement, a
charter principle, or a repository file the investigation actually matched.

A stale route can never be used. But the investigation behind it was expensive, and the
source item usually has not changed, so rebase carries it forward rather than starting over.

**This is not a hash refresh.** Code moving can change where the work belongs, how much may
be written, and whether the route is still confident. Reconsidering is the job.

## Procedure

### 1. Create the successor

```bash
node .claude/faro/tools/faro.mjs route-rebase $ARGUMENTS
```

This allocates a new route, re-binds the surviving sources at their current content, records
lineage, supersedes the original, and drops repository bindings whose file no longer exists.
It refuses if the route is not actually stale.

The successor cannot be used yet: `rebase.reconsidered` is false, and both approval and
validation treat its carried-forward conclusions as provisional.

### 2. Read what changed

`rebase.changed_bindings` names it exactly. For each entry, decide what kind of change it was:

| What moved | What it can do to the route |
|---|---|
| the compiled requirement version | the signature may no longer describe the work — recompile it |
| a bound contract file | the write scope may be wrong, or a protected surface may have moved |
| a bound implementation file | the hypothesis that located the work may no longer hold |
| a charter principle or decision | the isolation or exclusions may no longer be justified |
| a dropped binding (file deleted) | the route pointed at something that no longer exists |

### 3. Re-run the affected probes — and only those

```bash
node .claude/faro/tools/faro.mjs probe consumer_search --repo app --query <moved-module> --record INV-NNNN
```

Probes whose target did not change are still valid evidence; re-running everything wastes the
narrowing the original investigation paid for. Record the new probes into the investigation so
the evidence trail stays continuous.

If the shape of the work changed enough that the old hypotheses no longer describe it, open a
**new** investigation rather than stretching the old one, and point the successor at it.

### 4. Reconsider the contract

Follow the **faro-route-synthesis** skill again. Re-derive rather than re-justify:

- context — mandatory, optional, excluded
- read, write, protected, excluded scope
- isolation and required environment
- verification obligations
- routing confidence and ambiguities
- `route_facts`, re-asserted against the current contract

Then record what reconsideration concluded:

```yaml
rebase:
  reconsidered: true
  reconsidered_at: <timestamp>
  scope_added: ["app:services/ingestion/src/store/raw-evidence.ts"]
  scope_removed: []
  confidence_changed: true
```

Re-bind to current content:

```bash
node .claude/faro/tools/faro.mjs bind ROUTE-NNNN ...
node .claude/faro/tools/faro.mjs bind-repo ROUTE-NNNN app:...
```

### 5. Validate and hand back

```bash
node .claude/faro/tools/faro.mjs render routes
node .claude/faro/tools/faro.mjs inspect
```

Report what changed in the repository, what that did to the scope, whether confidence moved,
and whether approval is now required. Approval is never inherited — if a human is needed, they
must grant it again on the successor.

## Boundary

Rebase reconsiders one route. It never approves it, never edits the original beyond marking it
`superseded` with a pointer to its successor, and never touches application code.
