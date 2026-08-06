#!/usr/bin/env node
/**
 * The Faro toolkit.
 *
 * Faro is a Claude-native framework: Claude reads the project, classifies
 * intake, and drafts artifacts. This toolkit exists only for the work that must
 * be deterministic — identity allocation, schema validation, content hashing,
 * atomic writes, approval gates, and view generation.
 *
 * Usage: node .claude/faro/tools/faro.mjs <command> [options]
 */
import process from 'node:process';
import path from 'node:path';
import { FaroError, isFaroError } from './lib/errors.mjs';
import { FARO_VERSION } from './lib/model.mjs';
import { openStore, nextId, readItem, writeItem, storePath, exists } from './lib/store.mjs';
import { findProjectRoot, hashText, readUtf8 } from './lib/fs-safe.mjs';
import { initProject } from './lib/init.mjs';
import { validateStore, formatReport, recoverTransactions } from './lib/inspect.mjs';
import { renderAllViews, renderView, VIEWS } from './lib/views.mjs';
import { applyProposal, approveProposal, rejectProposal } from './lib/apply.mjs';
import { rebaseProposal } from './lib/rebase.mjs';
import { migrateStore } from './lib/migrate.mjs';
import { readRepositories, resolveRepository } from './lib/repositories.mjs';
import {
  resolveRoutingSource,
  recordProbe,
  previewProbe,
  bindRepositoryFiles,
  approveRoute,
  rejectRoute,
  rebaseRoute,
} from './lib/routing.mjs';
import { executionBoundary, readWorkableRoute, scopeCheck } from './lib/execution.mjs';
import { branchName, commitWork, defaultBranchType, startBranch, workIdFor, workLog } from './lib/gitflow.mjs';
import { ordered, UNBINDABLE_PATHS, OBLIGATION_STATUS } from './lib/model.mjs';
import { now } from './lib/fs-safe.mjs';

const USAGE = `faro ${FARO_VERSION} — deterministic toolkit for the Faro project store

  faro init [--name "Project"] [--force]     create .faro/ in the current repository
  faro inspect [--json]                      validate and summarise the project
  faro verify [dir...] [--json] [--strict]   validate one or more projects (CI entry point)
  faro render [compass|requirements|routes]  regenerate the generated views
  faro next-id <requirement|decision|knowledge|baseline|obligation|intake|proposal|signature|investigation|route>
  faro bind <PROP-id> <store-path>...        record the canonical files a proposal was reasoned from
  faro approve <PROP-id> --by "Name"         grant human approval
  faro reject <PROP-id> --reason "..."       close a proposal without applying it
  faro apply <PROP-id>                       apply an open, fresh, approved proposal (one transaction)
  faro rebase <PROP-id>                      carry a stale proposal onto current state for reconsideration
  faro close <OBL-id> --status <s> --reason "..."   close an accepted obligation
  faro recover [--dry-run]                   resolve an interrupted transaction
  faro migrate [--dry-run]                   bring an older store up to the current schema

  Routing (read-only against registered repositories)
  faro repos                                 list the repositories routing may probe
  faro route-source <REQ-id@N|OBL-id>        resolve an exact routable source
  faro probe <type> --repo <id> [--query q] [--record INV-id] [--json]
  faro bind-repo <ROUTE-id> <repo>:<path>... bind a route to the code it relies on
  faro route-approve <ROUTE-id> --by "Name"  grant human approval for a route
  faro route-reject <ROUTE-id> --reason "..."
  faro route-rebase <ROUTE-id>               carry a stale route onto current state

  Working from an approved route (read-only; nothing is implemented here)
  faro route-boundary <ROUTE-id> [--base <ref>] [--working-tree-only] [--json]
                                             what the route authorises, and what the tree already does to it
  faro scope-check <ROUTE-id> [<repo>:<path>...] [--base <ref>] [--working-tree-only] [--json]
                                             classify every changed path — committed since the
                                             branch base, staged, unstaged, untracked — against
                                             all four scopes

  Git workflow (branch and commit only — never push, merge, or rebase)
  faro branch-start <ROUTE-id> --title "..." [--type t] [--work-id id] [--dry-run] [--json]
  faro commit <ROUTE-id> --subject "type(scope): outcome" [--body "..."] [--amend] <path>...
  faro work-log [--base <ref>] [--repo <id>] [--json]   the commits this branch added
  faro help

Every command accepts --cwd <dir> to run against a project elsewhere.

Exit codes: 0 success · 1 invalid project or refused operation · 2 usage error`;

/**
 * Flags that never take a value. Without this, `--amend path/to/file` would read
 * the path as the flag's argument and lose it, which is a silent wrong answer
 * rather than an error.
 */
const BOOLEAN_FLAGS = new Set(['json', 'force', 'strict', 'dry-run', 'amend', 'working-tree-only']);

main();

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const { flags, positional } = parseArgs(argv.slice(1));
  const cwd = flags.cwd ? path.resolve(String(flags.cwd)) : process.cwd();

  try {
    switch (command) {
      case 'init':
        return exit(cmdInit(cwd, flags));
      case 'inspect':
        return exit(cmdInspect(cwd, flags));
      case 'verify':
        return exit(cmdVerify(cwd, positional, flags));
      case 'render':
        return exit(cmdRender(cwd, positional));
      case 'next-id':
        return exit(cmdNextId(cwd, positional));
      case 'bind':
        return exit(cmdBind(cwd, positional));
      case 'approve':
        return exit(cmdApprove(cwd, positional, flags));
      case 'reject':
        return exit(cmdReject(cwd, positional, flags));
      case 'apply':
        return exit(cmdApply(cwd, positional));
      case 'rebase':
        return exit(cmdRebase(cwd, positional));
      case 'close':
        return exit(cmdClose(cwd, positional, flags));
      case 'recover':
        return exit(cmdRecover(cwd, flags));
      case 'migrate':
        return exit(cmdMigrate(cwd, flags));
      case 'repos':
        return exit(cmdRepos(cwd, flags));
      case 'route-source':
        return exit(cmdRouteSource(cwd, positional, flags));
      case 'probe':
        return exit(cmdProbe(cwd, positional, flags));
      case 'bind-repo':
        return exit(cmdBindRepo(cwd, positional));
      case 'route-approve':
        return exit(cmdRouteApprove(cwd, positional, flags));
      case 'route-reject':
        return exit(cmdRouteReject(cwd, positional, flags));
      case 'route-rebase':
        return exit(cmdRouteRebase(cwd, positional));
      case 'route-boundary':
        return exit(cmdRouteBoundary(cwd, positional, flags));
      case 'scope-check':
        return exit(cmdScopeCheck(cwd, positional, flags));
      case 'branch-start':
        return exit(cmdBranchStart(cwd, positional, flags));
      case 'commit':
        return exit(cmdCommit(cwd, positional, flags));
      case 'work-log':
        return exit(cmdWorkLog(cwd, flags));
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        process.stdout.write(`${USAGE}\n`);
        return exit(0);
      case '--version':
      case 'version':
        process.stdout.write(`${FARO_VERSION}\n`);
        return exit(0);
      default:
        process.stderr.write(`Unknown command "${command}".\n\n${USAGE}\n`);
        return exit(2);
    }
  } catch (err) {
    return exit(reportError(err));
  }
}

/* -------------------------------------------------------------- commands */

function cmdInit(cwd, flags) {
  const result = initProject({
    cwd,
    name: flags.name === undefined ? undefined : String(flags.name),
    force: flags.force === true,
  });
  const lines = [`Initialised Faro project "${result.name}" (${result.projectId})`, ''];
  for (const file of result.created) lines.push(`  created  ${file}`);
  lines.push('');
  lines.push('The Project Charter is an empty draft. Author it with /faro-charter.');
  lines.push('Then: /faro-adopt to land a brief or an existing repository, /faro-intake for a single idea.');
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function cmdInspect(cwd, flags) {
  const store = openStore(cwd);
  const report = validateStore(store);
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(toJson(report), null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report, store.dir)}\n`);
  }
  return report.status === 'invalid' ? 1 : 0;
}

function cmdVerify(cwd, positional, flags) {
  const targets = positional.length > 0 ? positional.map((entry) => path.resolve(cwd, entry)) : [cwd];
  const results = [];
  let code = 0;
  for (const target of targets) {
    const root = findProjectRoot(target);
    if (!root) {
      results.push({ target, status: 'invalid', problems: [{ severity: 'error', code: 'NO_PROJECT', path: target, message: 'no .faro/ store found here or in any parent' }] });
      code = 1;
      continue;
    }
    const report = validateStore({ root, dir: path.join(root, '.faro') });
    results.push({ target: root, ...toJson(report) });
    if (report.status === 'invalid') code = 1;
    if (report.status === 'warning' && flags.strict === true) code = 1;
  }
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ status: code === 0 ? 'ok' : 'failed', projects: results }, null, 2)}\n`);
    return code;
  }
  for (const result of results) {
    const problems = result.problems ?? [];
    const errors = problems.filter((problem) => problem.severity === 'error');
    const warnings = problems.filter((problem) => problem.severity === 'warning');
    process.stdout.write(`${result.status.toUpperCase().padEnd(8)} ${result.target}  (${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'})\n`);
    for (const problem of errors) process.stdout.write(`  error    ${problem.path}: ${problem.message}\n`);
    if (flags.strict === true) for (const problem of warnings) process.stdout.write(`  warning  ${problem.path}: ${problem.message}\n`);
  }
  return code;
}

function cmdRender(cwd, positional) {
  const store = openStore(cwd);
  const names = positional.length > 0 ? positional : Object.keys(VIEWS);
  for (const name of names) {
    if (!(name in VIEWS)) {
      throw new FaroError('UNKNOWN_VIEW', `"${name}" is not a view.`, { hint: `Known views: ${Object.keys(VIEWS).join(', ')}.` });
    }
  }
  const rendered = names.length === Object.keys(VIEWS).length ? renderAllViews(store) : names.map((name) => renderView(store, name));
  for (const view of rendered) process.stdout.write(`rendered  .faro/${view.relative}\n`);
  return 0;
}

function cmdNextId(cwd, positional) {
  const kind = positional[0];
  const kinds = ['requirement', 'decision', 'knowledge', 'baseline', 'obligation', 'intake', 'proposal', 'signature', 'investigation', 'route'];
  if (!kinds.includes(kind)) {
    throw new FaroError('USAGE', `next-id needs one of: ${kinds.join(', ')}.`, { hint: 'Example: faro next-id requirement' });
  }
  process.stdout.write(`${nextId(openStore(cwd), kind)}\n`);
  return 0;
}

function cmdBind(cwd, positional) {
  const [id, ...paths] = positional;
  if (!id || paths.length === 0) {
    throw new FaroError('USAGE', 'bind needs a proposal id and at least one store-relative path.', {
      hint: 'Example: faro bind PROP-0001 charter/charter.md requirements/REQ-0002/v1.md',
    });
  }
  const store = openStore(cwd);
  const { relative, type } = bindableArtifact(id);
  const proposal = readItem(store, relative, type);
  const bindings = [];
  for (const target of paths) {
    if (UNBINDABLE_PATHS.includes(target)) {
      throw new FaroError('UNBINDABLE_SOURCE', `${target} cannot be bound to a proposal.`, {
        hint: 'It changes on every commit and carries no meaning a classification can rest on. Bind to the artifacts you actually read.',
        path: `.faro/${target}`,
      });
    }
    if (!exists(store, target)) {
      throw new FaroError('FILE_MISSING', `Cannot bind to ${target}: it does not exist in the store.`, {
        hint: 'Bind only to canonical files the proposal actually read.',
        path: `.faro/${target}`,
      });
    }
    bindings.push({ path: target, hash: hashText(readUtf8(storePath(store, target))) });
  }
  writeItem(store, relative, ordered(type, { ...proposal.data, context_bindings: bindings }), proposal.body);
  process.stdout.write(`bound ${id} to ${bindings.length} canonical file(s)\n`);
  for (const binding of bindings) process.stdout.write(`  ${binding.hash.slice(0, 12)}  ${binding.path}\n`);
  return 0;
}

function cmdApprove(cwd, positional, flags) {
  const result = approveProposal(openStore(cwd), positional[0], flags.by === undefined ? '' : String(flags.by));
  process.stdout.write(`${result.id} approved by ${result.approvedBy}. Run \`/faro-apply ${result.id}\` to admit it.\n`);
  return 0;
}

function cmdReject(cwd, positional, flags) {
  const result = rejectProposal(openStore(cwd), positional[0], flags.reason === undefined ? '' : String(flags.reason));
  process.stdout.write(`${result.id} rejected: ${result.reason}\n`);
  return 0;
}

function cmdApply(cwd, positional) {
  const store = openStore(cwd);
  const result = applyProposal(store, positional[0]);
  const lines = [`Applied ${result.id} in ${result.transaction}`, ''];
  for (const item of result.written) lines.push(`  committed  .faro/${item}`);
  lines.push('');
  lines.push(`Admitted: ${result.appliedIds.join(', ')}`);
  const report = validateStore(store);
  lines.push(`Project state: ${report.status}`);
  if (report.openObligations.length > 0) {
    lines.push(`Open obligations: ${report.openObligations.map((item) => item.id).join(', ')}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return report.status === 'invalid' ? 1 : 0;
}

function cmdRebase(cwd, positional) {
  const store = openStore(cwd);
  const result = rebaseProposal(store, positional[0]);
  const lines = [`Rebased ${result.id} → ${result.successor} in ${result.transaction}`, ''];
  lines.push('These bound sources changed:');
  for (const change of result.changed) lines.push(`  ${change}`);
  if (result.droppedBindings.length > 0) {
    lines.push('');
    lines.push(`Dropped bindings whose source no longer exists: ${result.droppedBindings.join(', ')}`);
  }
  lines.push('');
  lines.push(`${result.id} is now superseded and can never be applied.`);
  lines.push(`${result.successor} carries the original's drafts and assertions as a starting point only —`);
  lines.push('re-run classification and impact analysis with /faro-rebase, then set rebase.reconsidered: true.');
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function cmdClose(cwd, positional, flags) {
  const id = positional[0];
  const status = flags.status === undefined ? '' : String(flags.status);
  const reason = flags.reason === undefined ? '' : String(flags.reason);
  if (!/^OBL-\d{4}$/.test(id ?? '') || !['fulfilled', 'withdrawn'].includes(status) || reason.trim() === '') {
    throw new FaroError('USAGE', 'close needs an obligation id, a terminal status, and a reason.', {
      hint: `Example: /faro-close OBL-0001 --status fulfilled --reason "fixed in the ingestion worker". Statuses: ${OBLIGATION_STATUS.filter((s) => s !== 'unrouted').join(', ')}.`,
    });
  }
  const store = openStore(cwd);
  const relative = `obligations/${id}.md`;
  if (!exists(store, relative)) {
    throw new FaroError('OBLIGATION_NOT_FOUND', `${id} does not exist.`, { hint: 'Run `/faro-inspect` to list open obligations.' });
  }
  const obligation = readItem(store, relative, 'obligation');
  if (obligation.data.status !== 'unrouted') {
    throw new FaroError('OBLIGATION_CLOSED', `${id} is already ${obligation.data.status}.`, {
      hint: 'A closed obligation stays closed; capture a new intake if the work returns.',
    });
  }
  writeItem(
    store,
    relative,
    ordered('obligation', { ...obligation.data, status, closed_at: now(), closure_reason: reason.trim() }),
    obligation.body,
  );
  process.stdout.write(`${id} closed as ${status}: ${reason.trim()}\n`);
  return 0;
}

function cmdRecover(cwd, flags) {
  const store = openStore(cwd);
  const results = recoverTransactions(store, { dryRun: flags['dry-run'] === true });
  if (results.length === 0) {
    process.stdout.write('No unfinished transactions. The store is settled.\n');
    return 0;
  }
  let code = 0;
  for (const result of results) {
    process.stdout.write(`${result.id}  ${result.action}\n  ${result.detail}\n`);
    if (result.action === 'ambiguous') code = 1;
  }
  if (code === 1) {
    process.stderr.write('\nfaro: at least one transaction could not be resolved deterministically.\n');
    process.stderr.write('  Compare the staged store under .faro/.txn/ with the live files and resolve it by hand. Faro will not guess.\n');
  }
  return code;
}

function cmdMigrate(cwd, flags) {
  const store = openStore(cwd);
  const dryRun = flags['dry-run'] === true;
  const result = migrateStore(store, { dryRun });
  const lines = [`${dryRun ? 'Would migrate' : 'Migrated'} schema v${result.from} → v${result.to}`, ''];
  for (const action of result.actions) lines.push(`  ${action}`);
  if (!dryRun) {
    const report = validateStore(store);
    lines.push('', `Project state: ${report.status}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    return report.status === 'invalid' ? 1 : 0;
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/* --------------------------------------------------------------- routing */

function cmdRepos(cwd, flags) {
  const store = openStore(cwd);
  const { repositories, declared } = readRepositories(store);
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ declared, repositories: repositories.map(({ absolute, ...rest }) => rest) }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(
    declared
      ? 'Repositories routing may probe (declared in .faro/repositories.json)\n'
      : 'Repositories routing may probe (default — declare more in .faro/repositories.json)\n',
  );
  for (const repository of repositories) {
    process.stdout.write(`  ${repository.id.padEnd(14)} ${repository.role.padEnd(11)} ${repository.root}${repository.present ? '' : '   MISSING'}\n`);
    process.stdout.write(`  ${' '.repeat(14)} ${repository.description}\n`);
  }
  return repositories.every((repository) => repository.present) ? 0 : 1;
}

function cmdRouteSource(cwd, positional, flags) {
  const store = openStore(cwd);
  const source = resolveRoutingSource(store, positional[0]);
  const summary = { type: source.type, id: source.id, version: source.version, path: source.path, content_hash: source.content_hash, title: source.title };
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${source.type} ${source.id}${source.version ? `@${source.version}` : ''} — ${source.title}\n`);
  process.stdout.write(`  path  .faro/${source.path}\n  hash  ${source.content_hash}\n`);
  return 0;
}

function cmdProbe(cwd, positional, flags) {
  const type = positional[0];
  const repository = flags.repo === undefined ? undefined : String(flags.repo);
  if (!type || !repository) {
    throw new FaroError('USAGE', 'probe needs a probe type and --repo.', {
      hint: 'Example: faro probe contract_search --repo app --query SourceRecordIdentity --record INV-0001',
    });
  }
  const store = openStore(cwd);
  const request = { type, repository, query: flags.query === undefined ? undefined : String(flags.query) };
  const probe = flags.record ? recordProbe(store, { ...request, investigation: String(flags.record) }) : previewProbe(store, request);

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
    return 0;
  }
  const lines = [`${probe.probe_id}  ${probe.type}  ${probe.repository}  ${probe.match_count} match(es)`];
  lines.push(`  mechanism  ${probe.mechanism}`);
  if (probe.query) lines.push(`  query      ${probe.query}`);
  for (const match of probe.matches.slice(0, 25)) {
    const where = match.lines?.length > 0 ? `  lines ${match.lines.slice(0, 8).join(', ')}` : '';
    lines.push(`  ${match.secret_suspected ? '! ' : '  '}${match.path}${where}${match.note ? `  (${match.note})` : ''}`);
  }
  if (probe.matches.length > 25) lines.push(`  … ${probe.matches.length - 25} more`);
  for (const limitation of probe.limitations ?? []) lines.push(`  limitation ${limitation}`);
  for (const error of probe.errors ?? []) lines.push(`  error      ${error}`);
  if (flags.record) lines.push(`  recorded into ${flags.record}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function cmdBindRepo(cwd, positional) {
  const [id, ...targets] = positional;
  if (!id || targets.length === 0) {
    throw new FaroError('USAGE', 'bind-repo needs a route id and at least one repository:path target.', {
      hint: 'Example: faro bind-repo ROUTE-0001 app:services/ingestion/src/worker/dedup.ts',
    });
  }
  const bindings = bindRepositoryFiles(openStore(cwd), id, targets);
  process.stdout.write(`bound ${id} to ${bindings.length} repository file(s)\n`);
  for (const bind of bindings) process.stdout.write(`  ${bind.hash.slice(0, 12)}  ${bind.repository}:${bind.path}\n`);
  return 0;
}

function cmdRouteApprove(cwd, positional, flags) {
  const result = approveRoute(openStore(cwd), positional[0], flags.by === undefined ? '' : String(flags.by));
  process.stdout.write(`${result.id} approved by ${result.approvedBy}. It may now be handed to execution.\n`);
  return 0;
}

function cmdRouteReject(cwd, positional, flags) {
  const result = rejectRoute(openStore(cwd), positional[0], flags.reason === undefined ? '' : String(flags.reason));
  process.stdout.write(`${result.id} rejected: ${result.reason}\n`);
  return 0;
}

function cmdRouteRebase(cwd, positional) {
  const store = openStore(cwd);
  const result = rebaseRoute(store, positional[0]);
  const lines = [`Rebased ${result.id} → ${result.successor} in ${result.transaction}`, ''];
  lines.push('These bound sources changed:');
  for (const change of result.changed) lines.push(`  ${change}`);
  if (result.droppedRepositoryBindings.length > 0) {
    lines.push('', `Dropped repository bindings whose file no longer exists: ${result.droppedRepositoryBindings.join(', ')}`);
  }
  lines.push('');
  lines.push(`${result.id} is now superseded and can never be used.`);
  lines.push(`${result.successor} carries the original's conclusions as a starting point only — re-run the`);
  lines.push('affected probes, reconsider scope and confidence, then set rebase.reconsidered: true.');
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/* ------------------------------------------------------------- execution */

function cmdRouteBoundary(cwd, positional, flags) {
  const boundary = executionBoundary(openStore(cwd), positional[0], {
    base: flags.base === undefined ? null : String(flags.base),
    includeCommitted: flags['working-tree-only'] !== true,
  });
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(boundary, null, 2)}\n`);
    return boundary.verdict === 'clear' ? 0 : 1;
  }

  const lines = [
    `${boundary.route.id}  ${boundary.route.confidence} confidence · ${boundary.route.isolation} isolation · approved${boundary.route.approved_by ? ` by ${boundary.route.approved_by}` : ' (auto-admissible)'}`,
    `  signature ${boundary.route.signature} · investigation ${boundary.route.investigation} · nothing moved outside the write scope`,
    '',
  ];
  for (const message of boundary.expected_binding_changes) lines.push(`  write-scope file already differs from the route's binding: ${message}`);
  if (boundary.expected_binding_changes.length > 0) lines.push('');
  const scopeBlock = (title, entries) => {
    lines.push(`${title}`);
    if (entries.length === 0) lines.push('  (none)');
    for (const entry of entries) lines.push(`  ${entry.repository}:${entry.path}`);
    lines.push('');
  };
  scopeBlock('Write scope — the only paths that may change', boundary.scope.write);
  scopeBlock('Protected scope — must not change without a route amendment', boundary.scope.protected);
  scopeBlock('Excluded scope — do not read or modify', boundary.scope.excluded);
  scopeBlock('Read scope', boundary.scope.read);

  lines.push('Verification the route requires');
  for (const item of boundary.verification) lines.push(`  ${item.id}  ${item.kind}  ${item.statement}`);
  lines.push('');
  lines.push('Stop conditions');
  for (const item of boundary.stop_conditions) lines.push(`  ${item}`);
  if (boundary.ambiguities.length > 0) {
    lines.push('', 'Unresolved ambiguities');
    for (const item of boundary.ambiguities) lines.push(`  ${item}`);
  }
  if (boundary.pending_challenges.length > 0) {
    lines.push('', 'Challenges no implementer or verifier may self-authorise');
    for (const item of boundary.pending_challenges) lines.push(`  ${item.challenge}`);
  }

  lines.push('', 'Working tree');
  for (const entry of boundary.repositories) {
    const state = entry.clean === null ? 'unknown' : entry.clean ? 'clean' : `${entry.changed_count} changed path(s)`;
    lines.push(`  ${entry.repository}  ${entry.branch ?? 'no branch'}  ${state}`);
  }
  for (const entry of boundary.overlapping) lines.push(`  OVERLAP    ${entry.repository}:${entry.path}  already changed, inside write scope`);
  for (const entry of boundary.violations) lines.push(`  VIOLATION  ${entry.repository}:${entry.path}  already changed, in ${entry.verdict} scope`);
  for (const entry of boundary.unrelated) lines.push(`  unrelated  ${entry.repository}:${entry.path}  changed, outside this route`);
  for (const limitation of boundary.limitations) lines.push(`  limitation ${limitation}`);
  for (const error of boundary.errors) lines.push(`  error      ${error}`);

  lines.push('', `Verdict: ${boundary.verdict}`);
  if (boundary.verdict === 'overlap_requires_confirmation') {
    lines.push('  Uncommitted work already sits inside this route\'s write scope. Only the user can say');
    lines.push('  whether it belongs to this work. Never stash, reset, checkout over, or discard it.');
  }
  if (boundary.verdict === 'scope_violation') {
    lines.push('  A protected or excluded path has already been changed. Resolve that before any work starts.');
  }
  if (boundary.verdict === 'base_unresolved') {
    lines.push('  The committed range could not be determined, so committed work was NOT inspected.');
    lines.push('  Pass --base <ref> to include it. Do not read this as a clean result.');
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return boundary.verdict === 'clear' ? 0 : 1;
}

function cmdScopeCheck(cwd, positional, flags) {
  const [id, ...targets] = positional;
  const store = openStore(cwd);
  // Deliberately not gated on freshness: this command is how a verifier reports
  // what changed, and a protected file that was touched is exactly the finding it
  // must surface — not a staleness error standing in front of it.
  const route = readWorkableRoute(store, id, { requireFresh: false });
  const parsed = targets.length === 0 ? undefined : targets.map((target) => {
    const separator = target.indexOf(':');
    if (separator === -1) {
      throw new FaroError('USAGE', `"${target}" is not a repository path.`, {
        hint: 'Targets look like app:services/ingestion/src/worker/dedup.ts',
      });
    }
    return { repository: target.slice(0, separator), path: target.slice(separator + 1) };
  });
  let result;
  const options = {
    freshness: route.freshness,
    base: flags.base === undefined ? null : String(flags.base),
    includeCommitted: flags['working-tree-only'] !== true,
  };
  try {
    result = scopeCheck(store, route.data, parsed, options);
  } catch (err) {
    if (err.code !== 'NO_COMMITS') throw err;
    // Nothing has been committed anywhere, so there is no range — say so and
    // check what there is, rather than failing with a hint nobody can follow.
    result = scopeCheck(store, route.data, parsed, { ...options, includeCommitted: false });
    result.limitations = [...result.limitations, `no commits exist yet, so only uncommitted work was checked`];
  }
  const code = result.ok && result.moved_bindings.length === 0 ? 0 : 1;

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ route: route.id, ...result }, null, 2)}\n`);
    return code;
  }
  const scanned = {
    branch: result.base
      ? `every change since ${result.base.ref} (${result.base.commit})${result.base.inferred ? ', inferred' : ''} — committed, staged, unstaged, and untracked`
      : 'every change on this branch',
    working_tree: 'uncommitted changes only — committed work is NOT inspected',
    paths: `${result.checked.length} named path(s)`,
  }[result.mode];
  const lines = [`${route.id}  ${scanned}, against the route's four scopes`, ''];
  if (result.checked.length === 0) lines.push('  no paths to check');
  for (const entry of result.checked) {
    const label = { write: 'allowed  ', protected: 'PROTECTED', excluded: 'EXCLUDED ', read: 'READ-ONLY', unrouted: 'UNROUTED ' }[entry.verdict];
    const where = entry.state ? `  [${entry.state}]` : '';
    lines.push(`  ${label}  ${entry.repository}:${entry.path}${where}${entry.entry ? `   (${entry.entry.path})` : ''}`);
  }
  for (const message of result.moved_bindings) lines.push(`  MOVED      ${message}`);
  for (const limitation of result.limitations) lines.push(`  limitation ${limitation}`);
  for (const error of result.errors) lines.push(`  error      ${error}`);
  lines.push('');
  if (!result.ok) lines.push('Out-of-scope change. Revert it, or stop and request a route amendment or rebase.');
  if (result.moved_bindings.length > 0) lines.push('A file the route rests on moved outside its write scope. The route may no longer describe this code.');
  if (code === 0) {
    lines.push(result.limitations.length > 0
      ? 'Every path checked is inside the route\'s write scope — but read the limitations above before calling this clean.'
      : 'Every path checked is inside the route\'s write scope, and nothing it rests on moved.');
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return code;
}

/* ----------------------------------------------------------- git workflow */

/**
 * The one repository a branch and its commits belong to.
 *
 * Branching is a whole-repository act, so a write scope spanning two of them has
 * no single answer. That is refused rather than resolved by picking one.
 */
function workRepository(store, route) {
  const writes = [...new Set((route.scope?.write_scope ?? []).map((entry) => entry.repository))];
  if (writes.length > 1) {
    throw new FaroError('CROSS_REPOSITORY_WRITE', `${route.id} writes to ${writes.join(' and ')}.`, {
      hint: 'One branch cannot span two repositories. Work them separately, in each repository, by hand.',
    });
  }
  const id = writes[0] ?? (route.repositories ?? []).find((entry) => entry.role === 'primary')?.id;
  if (!id) {
    throw new FaroError('NO_WORK_REPOSITORY', `${route.id} names no repository to work in.`, { hint: 'A route needs a primary repository.' });
  }
  return resolveRepository(store, id);
}

/** What the route's own artifacts say the work is, for the default branch type. */
function branchEvidence(store, route) {
  const writePaths = (route.scope?.write_scope ?? []).map((entry) => entry.path);
  const relative = `signatures/${route.signature}.md`;
  if (!exists(store, relative)) return { intent: null, writePaths, source: {}, sourceId: null };

  const signature = readItem(store, relative, 'signature').data;
  const source = signature.source ?? {};
  // A signature's `intent` is a block; `intent.type` is the vocabulary term.
  const evidence = { intent: signature.intent?.type ?? null, writePaths, source: { type: source.type }, sourceId: source.id ?? null };
  if (source.type === 'obligation' && source.id && exists(store, `obligations/${source.id}.md`)) {
    evidence.source.kind = readItem(store, `obligations/${source.id}.md`, 'obligation').data.kind;
  }
  return evidence;
}

function cmdBranchStart(cwd, positional, flags) {
  const store = openStore(cwd);
  const route = readWorkableRoute(store, positional[0]);
  const repository = workRepository(store, route.data);
  const evidence = branchEvidence(store, route.data);
  const fallback = defaultBranchType(evidence);

  const title = flags.title === undefined ? '' : String(flags.title);
  if (title.trim() === '') {
    throw new FaroError('USAGE', 'branch-start needs a --title describing the outcome.', {
      hint: 'Example: faro branch-start ROUTE-0001 --title "add huawei cloud sync"',
    });
  }
  const type = flags.type === undefined ? fallback.type : String(flags.type);
  const workId = flags['work-id'] === undefined ? workIdFor(evidence.sourceId) : String(flags['work-id']);
  const name = branchName({ type, title, workId });
  const result = startBranch(repository.absolute, { name, dryRun: flags['dry-run'] === true });

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ route: route.id, repository: repository.id, ...result, type, default_type: fallback, work_id: workId }, null, 2)}\n`);
    return 0;
  }
  const lines = [`${result.created ? 'Created' : 'Proposed'} branch  ${name}`];
  lines.push(`  repository  ${repository.id} (${repository.root})`);
  lines.push(`  base        ${result.base.branch ?? 'unknown'} at ${result.base.commit ?? 'unknown'}`);
  if (type !== fallback.type) {
    lines.push(`  NOTE        type "${type}" overrides the derived "${fallback.type}" — ${fallback.because}.`);
    lines.push('              If the real intent has changed, reconsider the route rather than the branch name.');
  } else {
    lines.push(`  type        ${type} — ${fallback.because}`);
  }
  if (!result.created) lines.push('  --dry-run: nothing was created and no branch was switched.');
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function cmdCommit(cwd, positional, flags) {
  const [id, ...paths] = positional;
  const store = openStore(cwd);
  const route = readWorkableRoute(store, id, { requireFresh: false });
  const repository = workRepository(store, route.data);
  const subject = flags.subject === undefined ? '' : String(flags.subject);
  if (subject.trim() === '' || paths.length === 0) {
    throw new FaroError('USAGE', 'commit needs a --subject and at least one path.', {
      hint: 'Example: faro commit ROUTE-0002 --subject "fix(identity): distinguish corrections from duplicates" services/ingestion/src/worker/dedup.ts',
    });
  }
  // Paths may be written either way — `docs/guide.md` or `app:docs/guide.md` —
  // so a path can be copied straight across from `scope-check` output.
  const scoped = paths.map((entry) => {
    const separator = entry.indexOf(':');
    if (separator === -1) return entry;
    const prefix = entry.slice(0, separator);
    // A repository id can never contain a colon, so anything that is not a
    // well-formed id is part of the filename — `docs/a:b.md` is a real path.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(prefix)) return entry;
    if (prefix !== repository.id) {
      throw new FaroError('REPOSITORY_NOT_REGISTERED', `"${prefix}" is not the repository this route writes to.`, {
        hint: `This branch works in "${repository.id}". One commit cannot span two repositories.`,
      });
    }
    return entry.slice(separator + 1);
  });

  const result = commitWork(repository.absolute, {
    route: route.data,
    repository: repository.id,
    paths: scoped,
    subject,
    body: flags.body === undefined ? null : String(flags.body),
    amend: flags.amend === true,
  });

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ route: route.id, repository: repository.id, ...result }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${result.amended ? 'amended' : 'committed'}  ${result.commit}  ${result.subject}\n`);
  for (const item of result.paths) process.stdout.write(`            ${repository.id}:${item}\n`);
  return 0;
}

function cmdWorkLog(cwd, flags) {
  const store = openStore(cwd);
  // The work log is plain git history, so it is read from the project root's
  // repository unless a route names another one.
  const target = flags.repo === undefined ? store.root : resolveRepository(store, String(flags.repo)).absolute;
  const log = workLog(target, flags.base === undefined ? null : String(flags.base));

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(log, null, 2)}\n`);
    return 0;
  }
  const lines = [`${log.branch ?? 'unknown branch'}  since ${log.base.ref} (${log.base.commit})${log.base.inferred ? ', inferred' : ''}`];
  if (log.commits.length === 0) lines.push('  no commits on this branch yet');
  for (const commit of log.commits) {
    lines.push(`  ${commit.commit}  ${commit.subject}${commit.conventional ? '' : '   NOT A CONVENTIONAL COMMIT'}`);
  }
  const irregular = log.commits.filter((commit) => !commit.conventional);
  if (irregular.length > 0) lines.push('', `${irregular.length} commit subject(s) do not follow Conventional Commits.`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return irregular.length === 0 ? 0 : 1;
}

/* --------------------------------------------------------------- helpers */

/** Which artifact an id belongs to, for the shared `faro bind` command. */
function bindableArtifact(id) {
  if (/^PROP-\d{4}$/.test(id)) return { relative: `intake/proposals/${id}.md`, type: 'proposal' };
  if (/^SIG-\d{4}$/.test(id)) return { relative: `signatures/${id}.md`, type: 'signature' };
  if (/^INV-\d{4}$/.test(id)) return { relative: `investigations/${id}.md`, type: 'investigation' };
  if (/^ROUTE-\d{4}$/.test(id)) return { relative: `routes/${id}.md`, type: 'route' };
  throw new FaroError('INVALID_ID', `"${id}" is not a bindable artifact id.`, {
    hint: 'Bind a proposal (PROP-), signature (SIG-), investigation (INV-), or route (ROUTE-).',
  });
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const [name, inline] = splitFlag(token.slice(2));
    if (inline !== undefined) {
      flags[name] = inline;
      continue;
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return { flags, positional };
}

function splitFlag(token) {
  const index = token.indexOf('=');
  return index === -1 ? [token, undefined] : [token.slice(0, index), token.slice(index + 1)];
}

/** Stable machine-readable projection of an inspection report. */
function toJson(report) {
  return {
    status: report.status,
    project: report.project,
    charter: report.charter,
    registries: report.registries,
    openProposals: report.openProposals,
    openObligations: report.openObligations,
    openRoutes: report.openRoutes,
    repositories: report.repositories,
    transactions: report.transactions,
    views: report.views.map((view) => ({ name: view.name, path: `.faro/${view.relative}`, state: view.state, reason: view.reason ?? null })),
    problems: [...report.problems].sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message)),
  };
}

function reportError(err) {
  if (isFaroError(err)) {
    process.stderr.write(`faro: ${err.message}\n`);
    if (err.hint) process.stderr.write(`  ${err.hint}\n`);
    if (process.env.FARO_DEBUG === '1') process.stderr.write(`${err.stack}\n`);
    return err.code === 'USAGE' ? 2 : 1;
  }
  process.stderr.write(`faro: unexpected failure — ${err.message}\n`);
  if (process.env.FARO_DEBUG === '1') process.stderr.write(`${err.stack}\n`);
  return 1;
}

function exit(code) {
  process.exitCode = code;
  return code;
}
