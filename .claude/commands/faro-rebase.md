---
description: Carry a stale intake proposal onto current project state and reconsider its classification.
argument-hint: "<PROP-NNNN>"
---

# /faro-rebase

A proposal goes stale when a canonical file it was reasoned from changes. It can never be
forced through — the classification was reached against a project that no longer exists.

But the original idea is still valid, and it is still on disk in the immutable intake record.
Rebase carries it forward so nobody has to retype it.

**This is not a hash refresh.** A source change can change what the input *is*. Reconsidering
is the entire job.

## Procedure

### 1. Create the successor

```bash
node .claude/faro/tools/faro.mjs rebase $ARGUMENTS
```

This allocates a new proposal, copies the drafts across, re-binds to current sources, records
lineage, and supersedes the original. It refuses if the proposal is not actually stale.

The successor is **not applicable yet**: `rebase.reconsidered` is false, and `faro apply`
refuses it until you do the work below.

### 2. Read what actually changed

The successor's `rebase.changed_bindings` names the sources that moved. Read each one **as it
is now**, not as the original proposal described it. Also re-read the original intake record —
that is the user's actual request, and it has not changed.

### 3. Reconsider the classification from scratch

Follow the **faro-intake-classification** skill again. Do not start from the previous answer
and look for reasons to keep it. Ask the decision order fresh, because these transitions are
exactly what rebase exists to catch:

| The change | What it can turn the proposal into |
|---|---|
| An existing requirement now covers the input | `new_requirement` → `requirement_revision` |
| A requirement was accepted defining this behaviour | `new_requirement` → `bug` |
| The target requirement entered a baseline | unchanged classification, but approval now required |
| A decision that justified the approach was superseded | the proposed approach may no longer be valid |
| The charter moved | the input may now be out of scope, or already covered |

If the classification survives reconsideration, say why in the reasoning — "unchanged" is a
conclusion that needs an argument too.

### 4. Rewrite the successor honestly

Update the successor proposal in place:

- classification and confidence
- `semantic_facts` — re-assert every fact against the **current** store, with current evidence.
  Facts are what approval is computed from, so copying them across unexamined is the one
  failure mode rebase exists to prevent.
- `related`, `alignment`, `not_affected`, `ambiguities`
- `changes` and the drafts under `PROP-NNNN.draft/` — the mutation set may need to change shape
  entirely (a revision instead of a creation, an obligation instead of a requirement)
- `approval.required` — recompute it; `faro verify` will reject an understatement

Then record what reconsideration concluded:

```yaml
rebase:
  reconsidered: true
  reconsidered_at: <timestamp>
  classification_changed: true | false
  mutation_set_changed: true | false
```

Re-bind if you read different sources this time:

```bash
node .claude/faro/tools/faro.mjs bind PROP-NNNN <paths...>
```

### 5. Validate and hand back

```bash
node .claude/faro/tools/faro.mjs inspect
```

Report: what changed in the project, what that did to the classification, whether approval
went up, and what the user needs to do next. Approval is never inherited from the original —
if a human is required, they must grant it again on the successor.

## Boundary

Rebase reconsiders one proposal. It does not apply it, does not grant approval, and never
edits the original beyond marking it `superseded` with a pointer to its successor — the
original stays on disk as evidence of what was concluded before the project moved.
