/**
 * The git workflow utility: meaningful branches, honest commits, nothing else.
 *
 * Faro's canonical model still ends at an approved route. This module adds no
 * artifact and no state — **git is the authority for branches and commits**, and
 * nothing here records what it did. There is no branch registry, no commit
 * registry, no delivery session, and no release object.
 *
 * Two of these operations write, and they write through fixed argument sets for a
 * reason. "Faro must not push" is a guarantee only if there is no code path that
 * pushes. So: no `push`, no `merge`, no `rebase`, no `reset`, no `clean`, no
 * `stash`, no branch deletion, no `--no-verify`, no `--force`, no remote or config
 * mutation. A hook that rejects a commit is reported, never bypassed.
 *
 * The naming and grouping judgement stays with Claude — what a change *means* is
 * not a function. What this module does is refuse the results that are wrong by
 * construction: a vague branch title, a commit subject that says nothing, and a
 * commit touching a path the route never authorised.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FaroError } from './errors.mjs';
import { classifyPath } from './execution.mjs';
import { unquoteGitPath } from './probes.mjs';

/** Conventional Commit types, used for both branch prefixes and commit subjects. */
export const BRANCH_TYPES = ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore'];

/**
 * Words that describe nothing. A title made only of these says "something
 * happened here", which is what a branch name exists to avoid.
 */
const VAGUE_WORDS = new Set([
  'update', 'updates', 'updated', 'change', 'changes', 'changed', 'misc', 'miscellaneous',
  'improve', 'improved', 'improvement', 'improvements', 'work', 'works', 'task', 'tasks',
  'fix', 'fixes', 'fixed', 'final', 'more', 'various', 'some', 'minor', 'small', 'big',
  'implementation', 'implement', 'cleanup', 'clean', 'tweak', 'tweaks', 'wip', 'temp', 'tmp',
]);

/** Nouns that name no particular thing. */
const GENERIC_NOUNS = new Set(['file', 'files', 'code', 'thing', 'things', 'stuff', 'item', 'items', 'part', 'parts', 'bit', 'bits']);

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'with', 'from', 'into', 'that', 'this', 'its', 'it', 'be', 'is', 'are', 'when', 'where', 'so', 'as', 'by']);

const MAX_BRANCH_LENGTH = 80;
const MAX_SUBJECT_LENGTH = 72;
const MAX_TITLE_WORDS = 8;

/* ------------------------------------------------------------ branch type */

/**
 * The branch type the route's own evidence implies.
 *
 * This is a *default*, not a verdict. Faro records intent on the signature and
 * kind on an obligation, and both are stated rather than inferred — so the mapping
 * is a table. Where the table is wrong because the real intent differs, Claude
 * passes an explicit type and the mismatch is reported rather than hidden.
 *
 * @param {{ source?: {type?: string, kind?: string}, intent?: string, writePaths?: string[] }} evidence
 * @returns {{ type: string, because: string }}
 */
export function defaultBranchType(evidence = {}) {
  const { source = {}, intent = null, writePaths = [] } = evidence;

  if (source.type === 'obligation' && source.kind === 'bug') {
    return { type: 'fix', because: 'the route corrects an accepted bug' };
  }
  if (intent === 'correction') {
    return { type: 'fix', because: 'the requirement signature states a correction intent' };
  }
  if (intent === 'documentation') {
    return { type: 'docs', because: 'the requirement signature states a documentation intent' };
  }
  if (writePaths.length > 0 && writePaths.every(isDocumentationPath)) {
    return { type: 'docs', because: 'every write target is documentation' };
  }
  if (writePaths.length > 0 && writePaths.every(isTestPath)) {
    return { type: 'test', because: 'every write target is a test' };
  }
  if (intent !== null) {
    return { type: 'feat', because: `the requirement signature states a ${intent} intent` };
  }
  return { type: 'feat', because: 'the route delivers new behaviour by default' };
}

const isDocumentationPath = (value) => /\.(md|mdx|rst|txt|adoc)$/i.test(value) || /(^|\/)docs?(\/|$)/i.test(value);
const isTestPath = (value) => /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i.test(value);

/* ---------------------------------------------------------------- naming */

/**
 * Turn a human title into a branch slug: lowercase, hyphenated, nothing else.
 * @param {string} title
 */
export function normalizeSlug(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Is this slug worth reading six months from now?
 *
 * The rule is not "does it look tidy" but "does it name an outcome". A slug whose
 * words are all vague or generic passes every syntactic check and still tells the
 * next person nothing, so that is the case this refuses.
 *
 * @param {string} slug an already-normalized slug
 * @returns {string[]} the problems, empty when the title is usable
 */
export function validateBranchTitle(slug) {
  const problems = [];
  if (!slug) return ['is empty'];
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    problems.push('must be lowercase letters, numbers, and single hyphens, and may not start or end with a hyphen');
  }
  const words = slug.split('-').filter(Boolean);
  if (words.length < 2) problems.push('must describe an outcome in at least two words');
  if (words.length > MAX_TITLE_WORDS) problems.push(`must be at most ${MAX_TITLE_WORDS} words`);

  const meaningful = words.filter((word) => !VAGUE_WORDS.has(word) && !GENERIC_NOUNS.has(word) && !STOPWORDS.has(word));
  if (meaningful.length < 2 && words.length >= 2) {
    const empty = words.filter((word) => VAGUE_WORDS.has(word) || GENERIC_NOUNS.has(word));
    problems.push(`says nothing specific — ${empty.length > 0 ? `${empty.join(', ')} describe${empty.length === 1 ? 's' : ''} no particular outcome` : 'name the outcome, not the activity'}`);
  }
  return problems;
}

/**
 * Compose and validate a branch name.
 * @param {{ type: string, title: string, workId?: string|null }} spec
 */
export function branchName(spec) {
  const { type, title, workId = null } = spec;
  if (!BRANCH_TYPES.includes(type)) {
    throw new FaroError('BRANCH_TYPE_UNKNOWN', `"${type}" is not a branch type.`, {
      hint: `Choose from: ${BRANCH_TYPES.join(', ')}. Do not choose chore merely because the work is technical.`,
    });
  }
  const slug = normalizeSlug(title);
  const problems = validateBranchTitle(slug);
  if (problems.length > 0) {
    throw new FaroError('BRANCH_TITLE_INVALID', `"${title}" is not a usable branch title: it ${problems.join('; it ')}.`, {
      hint: 'Name the outcome — add-huawei-cloud-sync, handle-divergent-record-identity, clarify-fitbit-oauth-setup.',
    });
  }
  const id = workId === null || workId === '' ? null : normalizeSlug(workId);
  if (id !== null && !/^[a-z][a-z0-9]*-[0-9]+$/.test(id)) {
    throw new FaroError('WORK_ID_INVALID', `"${workId}" is not a work id.`, {
      hint: 'Work ids look like us-0042, req-0012, or obl-0001.',
    });
  }
  const name = `${type}/${id === null ? slug : `${id}-${slug}`}`;
  if (name.length > MAX_BRANCH_LENGTH) {
    throw new FaroError('BRANCH_NAME_TOO_LONG', `"${name}" is ${name.length} characters; the limit is ${MAX_BRANCH_LENGTH}.`, {
      hint: 'Shorten the title to its essential words.',
    });
  }
  return name;
}

/** The work id a route implies, when it has one. `REQ-0012@1` → `req-0012`. */
export function workIdFor(source) {
  const match = /^(REQ|OBL)-(\d{4})/.exec(String(source ?? ''));
  return match === null ? null : `${match[1].toLowerCase()}-${match[2]}`;
}

/* ------------------------------------------------------ commit subjects */

const SUBJECT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9._/-]*)\))?(?<breaking>!)?: (?<description>.+)$/;

/**
 * Validate one Conventional Commit subject.
 *
 * Shape is checked because it is a grammar. Meaning is checked the same way a
 * branch title is: a subject whose words are all vague describes no change, and
 * `chore: update files` is exactly the commit this layer exists to prevent.
 *
 * @param {string} subject
 * @returns {string[]} problems, empty when the subject is usable
 */
export function validateCommitSubject(subject) {
  const value = String(subject ?? '');
  const problems = [];
  if (value.trim() === '') return ['is empty'];
  if (value.length > MAX_SUBJECT_LENGTH) problems.push(`is ${value.length} characters; keep a subject within ${MAX_SUBJECT_LENGTH}`);
  if (value.includes('\n')) problems.push('must be a single line — put context in the body');

  const match = SUBJECT_PATTERN.exec(value.split('\n')[0]);
  if (match === null) {
    problems.push('must look like `type(scope): outcome`, for example `fix(identity): distinguish corrections from duplicates`');
    return problems;
  }
  const { type, description } = match.groups;
  if (!BRANCH_TYPES.includes(type)) {
    problems.push(`uses type "${type}", which is not one of ${BRANCH_TYPES.join(', ')}`);
  }
  if (description.endsWith('.')) problems.push('must not end with a full stop');
  if (/^[A-Z][a-z]/.test(description)) problems.push('should start lowercase');

  const words = description.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  if (words.length < 2) problems.push('must describe the outcome in at least two words');
  const meaningful = words.filter((word) => !VAGUE_WORDS.has(word) && !GENERIC_NOUNS.has(word) && !STOPWORDS.has(word));
  if (meaningful.length === 0) {
    problems.push('describes no particular outcome — say what changed and to what effect');
  }
  return problems;
}

/** Split `type(scope): description` back into its parts, or null. */
export function parseCommitSubject(subject) {
  const match = SUBJECT_PATTERN.exec(String(subject ?? '').split('\n')[0]);
  if (match === null) return null;
  return { type: match.groups.type, scope: match.groups.scope ?? null, breaking: match.groups.breaking === '!', description: match.groups.description };
}

/* -------------------------------------------------------------- git calls */

/**
 * The only way this module reaches git. Fixed binary, no shell, no interactive
 * editor, and an explicit refusal of every argument that could publish or destroy.
 *
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  for (const forbidden of ['push', 'merge', 'rebase', 'reset', 'clean', 'stash', 'remote', 'config', 'cherry-pick', 'revert']) {
    if (args[0] === forbidden) {
      throw new FaroError('GIT_FORBIDDEN', `Faro does not run \`git ${forbidden}\`.`, {
        hint: 'Publishing, merging, and discarding work stay in your own git workflow.',
      });
    }
  }
  if (args[0] === 'restore' && !args.includes('--staged')) {
    throw new FaroError('GIT_FORBIDDEN', 'Faro only ever runs `git restore --staged`.', {
      hint: 'Without --staged it overwrites working-tree files, which is the user\'s work.',
    });
  }
  for (const argument of args) {
    if (['--no-verify', '-n', '--force', '-f', '--force-with-lease'].includes(argument)) {
      throw new FaroError('GIT_FORBIDDEN', `Faro does not pass \`${argument}\` to git.`, {
        hint: 'A hook that rejects a commit is reported, never bypassed.',
      });
    }
  }
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 30000,
    env: { ...process.env, GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error) return { code: null, stdout: '', stderr: result.error.message };
  return { code: result.status, stdout: result.stdout ?? '', stderr: (result.stderr ?? '').trim() };
}

/** @param {string} cwd */
function requireGitRepository(cwd) {
  const result = git(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (result.code !== 0 || result.stdout.trim() !== 'true') {
    throw new FaroError('NOT_A_GIT_REPOSITORY', `${cwd} is not inside a git working tree.`, {
      hint: 'Branching and committing need a git repository. Initialise one, or run the work yourself.',
    });
  }
  return git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
}

/** Current branch, head commit, and whether anything is uncommitted. */
function gitState(cwd) {
  requireGitRepository(cwd);
  const status = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  const changed = status.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const head = git(cwd, ['rev-parse', '--short', 'HEAD']);
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return {
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    head: head.code === 0 ? head.stdout.trim() : null,
    clean: changed.length === 0,
    changed_count: changed.length,
    changed: changed.map((line) => line.slice(2).trim()),
  };
}

/** @param {string} cwd @param {string} name */
function branchExists(cwd, name) {
  return git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).code === 0;
}

/** Does this branch name look like one Faro created for a work item? */
function isWorkBranch(name) {
  return new RegExp(`^(${BRANCH_TYPES.join('|')})/[a-z0-9][a-z0-9-]*$`).test(String(name ?? ''));
}

/* ----------------------------------------------------------- branch start */

/**
 * Create and switch to the work branch, after refusing every unsafe precondition.
 *
 * A dirty tree is refused rather than tidied. Faro will not stash, reset, clean,
 * or check out over anything — the user's uncommitted work is theirs, and a tool
 * that relocated it silently would be worse than one that stops.
 *
 * @param {string} cwd the registered repository root
 * @param {{ name: string, dryRun?: boolean }} request
 */
export function startBranch(cwd, request) {
  const { name, dryRun = false } = request;
  requireGitRepository(cwd);
  const state = gitState(cwd);

  if (branchExists(cwd, name)) {
    throw new FaroError('BRANCH_EXISTS', `Branch "${name}" already exists.`, {
      hint: 'Faro never reuses or overwrites a branch. Continue on it yourself, delete it if it is dead, or choose a different title.',
    });
  }
  if (!state.clean) {
    // Naming the paths matters: approving a route writes to `.faro/`, so the
    // commonest dirty tree here is the user's own approval waiting to be committed.
    const shown = state.changed.slice(0, 5).join(', ');
    const more = state.changed.length > 5 ? `, and ${state.changed.length - 5} more` : '';
    throw new FaroError('WORKING_TREE_DIRTY', `The working tree has ${state.changed_count} uncommitted change(s): ${shown}${more}.`, {
      hint: 'Commit, or set aside, your own changes first — an approved route waiting in .faro/ counts too. Faro will not stash, reset, clean, or check out over them.',
    });
  }
  if (isWorkBranch(state.branch) && state.branch !== name) {
    throw new FaroError('WORK_BRANCH_ACTIVE', `"${state.branch}" looks like another Faro work branch.`, {
      hint: 'Switch to the base branch you want this work to start from, then run it again. Faro does not move between work items on its own.',
    });
  }

  const base = { branch: state.branch, commit: state.head };
  if (dryRun) return { name, created: false, base };

  const created = git(cwd, ['switch', '--create', name]);
  if (created.code !== 0) {
    throw new FaroError('BRANCH_CREATE_FAILED', `git could not create "${name}".`, { hint: created.stderr || 'git reported no detail.' });
  }
  return { name, created: true, base };
}

/* ---------------------------------------------------------------- commit */

/**
 * Commit one coherent part of the work.
 *
 * Every named path is checked against the route before anything is staged, so a
 * file the route never authorised cannot enter history — which is the one thing
 * this command exists to make impossible rather than merely discouraged.
 *
 * @param {string} cwd the registered repository root
 * @param {{ route: Record<string, any>, repository: string, paths: string[], subject: string, body?: string|null, amend?: boolean }} request
 */
export function commitWork(cwd, request) {
  const { route, repository, subject, body = null, amend = false } = request;
  let { paths } = request;
  requireGitRepository(cwd);

  const problems = validateCommitSubject(subject);
  if (problems.length > 0) {
    throw new FaroError('COMMIT_SUBJECT_INVALID', `"${subject}" is not a usable commit subject: it ${problems.join('; it ')}.`, {
      hint: 'Conventional Commits: `feat(huawei): add cloud authorization flow`.',
    });
  }
  if (paths.length === 0) {
    throw new FaroError('COMMIT_EMPTY', 'A commit needs at least one path.', {
      hint: 'Name the files that belong to this coherent part of the work.',
    });
  }

  // A path given to git is a *pathspec*, not a filename: `docs` stages everything
  // beneath it. Classifying the pathspec alone would pass, because a write entry
  // covers it — and a protected file nested inside would be swept into the commit
  // by the one command whose job is to make that impossible. So the pathspec is
  // expanded to the concrete files git would actually stage, every one of those is
  // classified, and those files are what gets committed.
  const concrete = expandPathspecs(cwd, paths);
  if (concrete.length === 0) {
    throw new FaroError('COMMIT_EMPTY', 'None of the named paths have any change to commit.', {
      hint: `Nothing under ${paths.join(', ')} differs from HEAD.`,
    });
  }
  const outside = concrete
    .map((relative) => classifyPath(route, repository, relative))
    .filter((entry) => entry.verdict !== 'write');
  if (outside.length > 0) {
    throw new FaroError('COMMIT_OUT_OF_SCOPE', `${outside.length} path(s) are outside the route's write scope.`, {
      hint: `${outside.map((entry) => `${entry.path} is ${entry.verdict}`).join('; ')}. Revert them, or stop and request a route amendment.`,
    });
  }
  paths = concrete;

  if (amend) {
    const published = git(cwd, ['branch', '--remotes', '--contains', 'HEAD']);
    if (published.code === 0 && published.stdout.trim() !== '') {
      throw new FaroError('COMMIT_ALREADY_PUBLISHED', 'HEAD is already on a remote branch and must not be amended.', {
        hint: `It exists on ${published.stdout.trim().split('\n').map((line) => line.trim()).join(', ')}. Add a corrective commit instead.`,
      });
    }
  }

  // What the user had staged before Faro touched anything. Those entries are
  // theirs: `git commit -- <paths>` never carries them into this commit, and
  // cleanup after a failure must never unstage them either.
  const preStaged = new Set(
    git(cwd, ['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean),
  );
  // `git add` would overwrite the index entry for a path the user staged by hand,
  // destroying a `git add -p` snapshot that exists nowhere else. Refusing is the
  // only honest option: Faro cannot put it back if the commit then fails.
  const clash = paths.filter((entry) => preStaged.has(entry) && git(cwd, ['diff', '--quiet', '--', entry]).code !== 0);
  if (clash.length > 0) {
    throw new FaroError('COMMIT_STAGED_CLASH', `${clash.join(', ')} already staged with content that differs from the working tree.`, {
      hint: 'Faro will not overwrite a staging snapshot you built by hand. Commit or unstage it first.',
    });
  }
  const faroStaged = paths.filter((entry) => !preStaged.has(entry));

  const staged = git(cwd, ['add', '--', ...paths]);
  if (staged.code !== 0) {
    unstage(cwd, faroStaged);
    throw new FaroError('COMMIT_STAGE_FAILED', 'git could not stage the named paths.', { hint: staged.stderr || 'git reported no detail.' });
  }

  const args = ['commit', '--message', subject];
  if (body !== null && String(body).trim() !== '') args.push('--message', String(body).trim());
  if (amend) args.push('--amend');
  args.push('--', ...paths);

  const committed = git(cwd, args);
  if (committed.code !== 0) {
    // A hook or a signing failure is a real result, not something to work around.
    // Faro reported failure, so it must leave no trace: the paths it staged come
    // back out of the index, and the working-tree content is never touched.
    const restored = unstage(cwd, faroStaged);
    throw new FaroError('COMMIT_FAILED', 'git refused the commit.', {
      hint: `${committed.stderr || 'git reported no detail.'} Faro never retries with --no-verify.${
        restored === null ? '' : ` ${restored}`
      }`,
    });
  }
  const head = git(cwd, ['rev-parse', '--short', 'HEAD']);
  return { subject, amended: amend, commit: head.stdout.trim(), paths };
}

/**
 * Uncommitted paths, with *where* they are uncommitted preserved.
 *
 * The `working_tree_status` probe trims porcelain's `XY` field, which collapses
 * staged and unstaged into one token. Verification needs them apart, so this
 * reads the raw columns: X is the index, Y is the working tree, `??` untracked.
 *
 * @param {string} cwd
 * @returns {{path: string, staged: boolean, unstaged: boolean, untracked: boolean}[]}
 */
export function workingTreePaths(cwd) {
  requireGitRepository(cwd);
  // `-z` is not a detail. Without it git quotes any path holding a non-ASCII or
  // unusual byte and octal-escapes it, and a rename arrives as `old -> new` in a
  // single field that a filename may itself contain. NUL-delimited output is
  // verbatim and unambiguous, so no unquoting step can mangle a path into one
  // that lands in a different scope.
  const status = git(cwd, ['status', '--porcelain', '-z', '--untracked-files=all']);
  if (status.code !== 0) return [];
  const prefix = repositoryPrefix(cwd);
  const fields = status.stdout.split('\0');
  const paths = [];
  const add = (raw, states) => {
    const relative = stripRepositoryPrefix(raw, prefix);
    if (relative === null || relative === '') return;
    paths.push({ path: relative, ...states });
  };

  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (entry === '') continue;
    const index = entry[0];
    const worktree = entry[1];
    const target = entry.slice(3);

    if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') {
      // A rename emits the destination in this field and the ORIGIN in the next.
      // The origin is a deletion, and if it was protected that deletion is the
      // violation — reporting only the destination is how a protected file gets
      // renamed away while the check reads clean.
      const origin = fields[i + 1] ?? '';
      i += 1;
      const states = { staged: index !== ' ' && index !== '?', unstaged: worktree !== ' ' && worktree !== '?', untracked: false };
      add(target, { ...states, renamePair: stripRepositoryPrefix(origin, prefix) });
      add(origin, { ...states, renamedFrom: true, renamePair: stripRepositoryPrefix(target, prefix) });
      continue;
    }
    add(target, {
      staged: index !== ' ' && index !== '?',
      unstaged: worktree !== ' ' && worktree !== '?',
      untracked: index === '?' && worktree === '?',
    });
  }
  return paths;
}

/* ------------------------------------------------------------ branch base */

/**
 * The commit a work branch started from.
 *
 * Inference is deliberately narrow. Reviewing the wrong range is worse than
 * refusing, because the wrong range reads as a clean result: a base that is too
 * new hides the work, and one that is too old attributes somebody else's commits
 * to it. So an explicit `--base` wins, an upstream is trusted, exactly one of
 * `main`/`master` is trusted, and anything else is refused.
 *
 * @param {string} cwd
 * @param {string|null} base an explicit ref, or null to infer
 * @returns {{ ref: string, commit: string, inferred: boolean }}
 */
export function resolveBase(cwd, base = null) {
  requireGitRepository(cwd);
  if (git(cwd, ['rev-parse', '--verify', 'HEAD']).code !== 0) {
    throw new FaroError('NO_COMMITS', 'This repository has no commits, so there is no range to compare against.', {
      hint: 'Everything is uncommitted. Re-run with --working-tree-only, or make a first commit.',
    });
  }

  if (base !== null && base !== '') {
    const merged = git(cwd, ['merge-base', 'HEAD', base]);
    if (merged.code !== 0) {
      throw new FaroError('BASE_UNRESOLVABLE', `"${base}" is not a commit this branch shares history with.`, {
        hint: git(cwd, ['rev-parse', '--verify', `${base}^{commit}`]).code === 0
          ? 'It exists but has no common ancestor with HEAD. Name the commit this work actually branched from.'
          : 'No such branch or commit.',
      });
    }
    return { ref: base, commit: merged.stdout.trim(), inferred: false };
  }

  // An upstream only names a base when it is a *different* branch. A work branch's
  // upstream is its own remote copy — `origin/work` for `work` — and using it
  // would put everything committed before the push outside the range. Comparing
  // commits is not enough: one further commit makes the mirror a strict ancestor
  // and it silently becomes the base. The branch *name* is what settles it.
  const current = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const upstreamName = git(cwd, ['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim();
  const isOwnMirror = upstreamName !== '' && current !== '' && upstreamName.endsWith(`/${current}`);
  const upstream = git(cwd, ['merge-base', 'HEAD', '@{upstream}']);
  if (upstream.code === 0 && !isOwnMirror) {
    return { ref: upstreamName || '@{upstream}', commit: upstream.stdout.trim(), inferred: true };
  }

  const present = ['main', 'master'].filter((name) => branchExists(cwd, name));

  // Standing on a base branch means nothing has branched yet, so the base is
  // HEAD and there is nothing ambiguous about it — even when both main and
  // master exist. Without this, starting work in such a repository would be
  // refused for a range that does not yet matter.
  if (present.includes(current)) {
    return { ref: 'HEAD', commit: git(cwd, ['rev-parse', 'HEAD']).stdout.trim(), inferred: true, degenerate: current };
  }

  if (present.length === 1) {
    const merged = git(cwd, ['merge-base', 'HEAD', present[0]]);
    if (merged.code === 0) return { ref: present[0], commit: merged.stdout.trim(), inferred: true };
  }

  throw new FaroError('AMBIGUOUS_BASE', 'The commit this work branched from cannot be determined.', {
    hint: present.length > 1
      ? `Both ${present.join(' and ')} exist and there is no upstream, so the range is a guess. Pass --base <ref>.`
      : 'There is no upstream and no single main or master branch. Pass --base <ref>.',
  });
}

/**
 * Paths this branch changed since `baseCommit`, repository-relative.
 *
 * The range is three-dot — `git diff base...HEAD`, which compares the merge base
 * with HEAD. Two-dot would also report every file that moved on the base branch
 * after this one forked, and those would arrive as out-of-scope violations for
 * work the branch never touched.
 *
 * @param {string} cwd
 * @param {string} baseCommit
 */
export function committedPaths(cwd, baseCommit) {
  requireGitRepository(cwd);
  // `-z` for the same reason as the working tree, and `--no-renames` so a rename
  // is reported as the deletion plus the addition it actually is — a protected
  // file moved out of the way must not be invisible because git paired it up.
  const result = git(cwd, ['diff', '--name-status', '-z', '--no-renames', `${baseCommit}...HEAD`]);
  if (result.code !== 0) {
    throw new FaroError('BASE_UNRESOLVABLE', `git could not diff ${baseCommit}...HEAD.`, { hint: result.stderr || 'git reported no detail.' });
  }
  const prefix = repositoryPrefix(cwd);
  const fields = result.stdout.split('\0');
  const paths = [];
  let outside = 0;
  // With -z the status and the path are separate fields, in pairs.
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const status = fields[i];
    if (status === '') continue;
    const relative = stripRepositoryPrefix(fields[i + 1], prefix);
    if (relative === null) {
      outside += 1;
      continue;
    }
    if (relative !== '') paths.push({ path: relative, status: status.trim() });
  }
  return { paths, outside };
}

/**
 * How far the registered root sits below the git root. Porcelain and diff both
 * report paths from the git root, and a scope is written from the registered one.
 */
function repositoryPrefix(cwd) {
  const toplevel = git(cwd, ['rev-parse', '--show-toplevel']);
  if (toplevel.code !== 0) return '';
  const gitRoot = fs.realpathSync(toplevel.stdout.trim());
  const registered = fs.realpathSync(cwd);
  return gitRoot === registered ? '' : path.relative(gitRoot, registered).split(path.sep).join('/');
}

function stripRepositoryPrefix(value, prefix) {
  if (prefix === '') return value;
  if (value === prefix) return '';
  return value.startsWith(`${prefix}/`) ? value.slice(prefix.length + 1) : null;
}

/**
 * The concrete changed files a set of pathspecs covers.
 *
 * Uses the same NUL-delimited status the scope check reads, limited to the given
 * pathspecs, so `docs` becomes the files under `docs` that actually differ.
 */
function expandPathspecs(cwd, pathspecs) {
  // Deliberately unfiltered. `git status -- docs` shows only the destination of a
  // rename into `docs`, so filtering in git would hide the source — and if that
  // source is protected, the commit deletes it while every check reads clean.
  // The whole status is read, the pathspecs select from it, and a selected
  // rename drags its other end in with it.
  const covered = (relative) => pathspecs.some((spec) => relative === spec || relative.startsWith(`${spec.replace(/\/+$/, '')}/`));
  const entries = workingTreePaths(cwd);
  const files = new Set();
  for (const entry of entries) {
    if (!covered(entry.path)) continue;
    files.add(entry.path);
    if (entry.renamePair) files.add(entry.renamePair);
  }
  return [...files].sort();
}

/**
 * Take Faro's own paths back out of the index, leaving the working tree alone.
 *
 * `git restore --staged` only rewrites index entries, so file content survives
 * byte-for-byte. `reset` would do the same job and is refused by the git entry
 * point on purpose — a verb that can discard work has no business in a cleanup
 * path, so a failure here is reported rather than escalated to a blunter tool.
 *
 * @returns {string|null} a sentence for the error hint, or null when nothing was staged
 */
function unstage(cwd, paths) {
  if (paths.length === 0) return null;
  const restored = git(cwd, ['restore', '--staged', '--', ...paths]);
  if (restored.code === 0) return `The ${paths.length} path(s) Faro staged were unstaged again; your files are unchanged.`;
  return `Faro could not unstage ${paths.join(', ')} (${restored.stderr || 'no detail'}) — they may still be in the index.`;
}

/* -------------------------------------------------------------- work log */

/**
 * The commits this branch added, for the report. Read-only, and honest about
 * which base it measured from — a log against a guessed base is worse than none.
 *
 * @param {string} cwd
 * @param {string|null} base
 */
export function workLog(cwd, base = null) {
  requireGitRepository(cwd);
  const state = gitState(cwd);
  const resolved = resolveBase(cwd, base);

  const UNIT = '\x1f';
  const RECORD = '\x1e';
  const log = git(cwd, ['log', `--format=%h${UNIT}%s${UNIT}%b${RECORD}`, `${resolved.commit}..HEAD`]);
  const commits = log.stdout
    .split(RECORD)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [hash, subject, body] = entry.split(UNIT);
      return { commit: hash, subject, body: (body ?? '').trim() || null, conventional: validateCommitSubject(subject).length === 0 };
    })
    .reverse();

  return {
    branch: state.branch,
    base: { ref: resolved.ref, commit: git(cwd, ['rev-parse', '--short', resolved.commit]).stdout.trim(), inferred: resolved.inferred },
    commits,
  };
}
