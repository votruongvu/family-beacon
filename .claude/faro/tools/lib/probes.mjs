/**
 * Deterministic, read-only repository probes.
 *
 * Probes establish facts about a repository. They never decide what a
 * requirement *means* — that is Claude's job, and a probe that scored keyword
 * similarity would be exactly the semantic classification this layer must not do.
 *
 * Three rules hold for every probe:
 *
 *   **Read-only.** Nothing here writes, deletes, or executes a project script.
 *   The only external command is `git`, with fixed read-only arguments.
 *
 *   **Bounded.** Every probe walks a repository once, skipping dependency and
 *   build directories, capping file size and match count, and recording what it
 *   skipped in `limitations`. A probe that silently truncated would be worse than
 *   one that found nothing.
 *
 *   **No content leaves.** Matches carry a path, line numbers, and a content
 *   hash — never the matched text. That makes secret disclosure structurally
 *   impossible rather than a filter that might miss a case, and Claude can still
 *   read any file it has a reason to open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FaroError } from './errors.mjs';
import { PROBE_TYPES } from './model.mjs';
import { hashText, now } from './fs-safe.mjs';
import { IGNORED_DIRECTORIES, resolveInRepository } from './repositories.mjs';

const MAX_FILES = 20000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_MATCHES = 200;

/** Extensions worth searching. Anything else is treated as opaque. */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc',
  '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.m', '.mm', '.h', '.c', '.cc', '.cpp', '.hpp',
  '.py', '.rb', '.php', '.cs', '.scala', '.dart', '.ex', '.exs',
  '.sql', '.graphql', '.proto', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.properties', '.xml', '.gradle',
  '.md', '.mdx', '.txt', '.sh', '.bash', '.zsh', '.env', '.example', '.lock', '.tf', '.dockerfile',
]);

/** Filenames that usually hold credentials. Reported, never read into output. */
const SECRET_NAME_PATTERNS = [
  /(^|[.-])env($|\.)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /(^|[/._-])secret/i,
  /(^|[/._-])credential/i,
  /id_(rsa|dsa|ecdsa|ed25519)$/i,
];

/** Content shapes that indicate a credential without ever reporting its value. */
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(aws_secret_access_key|client_secret|api[_-]?key|private[_-]?key)\b\s*[:=]/i,
  /\bghp_[A-Za-z0-9]{20,}/,
];

const TEST_PATH = /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i;
const MIGRATION_PATH = /(^|\/)(migrations?|db\/migrate|schema)(\/|$)|(^|\/)(V\d+__|\d{3,}[_-])/i;
const CONFIG_PATH = /(^|\/)(config|configs|conf|settings|environments?)(\/|$)|\.(ya?ml|toml|ini|cfg|properties|env)$|(^|\/)\.env/i;
const COMPOSITION_PATH = /(^|\/)(registry|registries|index|module|modules|container|bootstrap|composition|wiring|providers?|factory|main|app)\.[a-z]+$|(^|\/)(registry|composition-root|di)(\/|$)/i;

const MANIFESTS = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json'];

/* ------------------------------------------------------------------ walking */

/** @type {Map<string, {files: {relative: string, absolute: string, size: number}[], limitations: string[]}>} */
const scanCache = new Map();

/**
 * Every candidate file in a repository, ignoring dependency and build output.
 * @param {{absolute: string, id: string}} repository
 */
export function scanRepository(repository) {
  const cached = scanCache.get(repository.absolute);
  if (cached) return cached;

  const rootReal = fs.realpathSync(repository.absolute);
  const files = [];
  const limitations = [];
  const skippedDirectories = new Set();

  const walk = (dir) => {
    if (files.length >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      limitations.push(`could not read ${path.relative(rootReal, dir) || '.'}: ${err.code ?? err.message}`);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_FILES) return;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          skippedDirectories.add(entry.name);
          continue;
        }
        walk(absolute);
        continue;
      }
      if (entry.isSymbolicLink()) {
        // A symlink is followed only when it stays inside the root.
        try {
          const real = fs.realpathSync(absolute);
          if (path.relative(rootReal, real).startsWith('..')) {
            limitations.push(`skipped symlink leaving the repository: ${path.relative(rootReal, absolute)}`);
            continue;
          }
          if (!fs.statSync(real).isFile()) continue;
        } catch {
          limitations.push(`skipped unreadable symlink: ${path.relative(rootReal, absolute)}`);
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }
      let size = 0;
      try {
        size = fs.statSync(absolute).size;
      } catch {
        continue;
      }
      files.push({ relative: path.relative(rootReal, absolute).split(path.sep).join('/'), absolute, size });
    }
  };

  walk(rootReal);
  if (files.length >= MAX_FILES) limitations.push(`file walk stopped at the ${MAX_FILES}-file cap; results are partial`);
  if (skippedDirectories.size > 0) limitations.push(`skipped dependency and build directories: ${[...skippedDirectories].sort().join(', ')}`);

  const result = { files, limitations };
  scanCache.set(repository.absolute, result);
  return result;
}

/** Tests mutate fixtures between cases, so the cache has to be droppable. */
export function clearScanCache() {
  scanCache.clear();
}

function isSearchable(file) {
  const ext = path.extname(file.relative).toLowerCase();
  const base = path.basename(file.relative);
  if (file.size > MAX_FILE_BYTES) return false;
  return TEXT_EXTENSIONS.has(ext) || MANIFESTS.includes(base) || base.startsWith('.env') || !ext;
}

function looksLikeSecret(file, text) {
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(file.relative))) return true;
  return text !== null && SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Read a file for searching, or null when it is binary, huge, or unreadable. */
function readSearchable(file) {
  try {
    const text = fs.readFileSync(file.absolute, 'utf8');
    // A NUL byte means the file is binary, however inviting its extension looked.
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

/**
 * Line numbers where `test` matches. Only positions are ever returned — never
 * the line itself — so a probe cannot leak a credential it happened to match.
 */
function matchLines(text, test) {
  const lines = [];
  text.split('\n').forEach((line, index) => {
    if (lines.length < 50 && test(line)) lines.push(index + 1);
  });
  return lines;
}

/* ------------------------------------------------------------------- probes */

/**
 * Run one probe. Always read-only; always normalized.
 *
 * @param {{absolute: string, id: string, root: string}} repository
 * @param {{ type: string, query?: string, target?: string }} request
 * @returns {Record<string, any>} a probe record, minus the id the investigation assigns
 */
export function runProbe(repository, request) {
  const { type, query = null, target = null } = request;
  if (!PROBE_TYPES.includes(type)) {
    throw new FaroError('UNKNOWN_PROBE', `"${type}" is not a probe type.`, { hint: `Known probes: ${PROBE_TYPES.join(', ')}.` });
  }
  const base = {
    type,
    repository: repository.id,
    repository_root: repository.root,
    query: query ?? target,
    matches: [],
    limitations: [],
    errors: [],
    executed_at: now(),
    revision: gitRevision(repository),
  };

  const needsQuery = ['identifier_search', 'contract_search', 'implementation_search', 'reference_search', 'registration_search', 'consumer_search'];
  if (needsQuery.includes(type) && !base.query) {
    throw new FaroError('PROBE_NEEDS_QUERY', `Probe "${type}" needs a --query.`, {
      hint: 'Name the identifier, contract, or module path the hypothesis is about.',
    });
  }

  switch (type) {
    case 'repository_discovery':
      return { ...base, ...discoverRepository(repository) };
    case 'working_tree_status':
      return { ...base, ...workingTree(repository) };
    case 'manifest_inspection':
      return { ...base, ...inspectManifests(repository) };
    case 'test_discovery':
      return { ...base, ...byPath(repository, TEST_PATH, base.query, 'file walk (test path patterns)') };
    case 'migration_discovery':
      return { ...base, ...byPath(repository, MIGRATION_PATH, base.query, 'file walk (migration path patterns)') };
    case 'configuration_discovery':
      return { ...base, ...byPath(repository, CONFIG_PATH, base.query, 'file walk (configuration path patterns)') };
    case 'identifier_search':
      return { ...base, ...byContent(repository, base.query, (line, q) => line.includes(q), 'literal identifier scan') };
    case 'contract_search':
      return { ...base, ...byContent(repository, base.query, contractDeclares, 'declaration scan (interface/type/class/protocol/struct/trait)') };
    case 'implementation_search':
      return { ...base, ...byContent(repository, base.query, implementsContract, 'implementation scan (implements/extends/impl-for/conforms)') };
    case 'reference_search':
      return { ...base, ...byContent(repository, base.query, referencesModule, 'import and require scan') };
    case 'registration_search':
      return { ...base, ...registrationSearch(repository, base.query) };
    case 'consumer_search':
      return { ...base, ...consumerSearch(repository, base.query) };
    default:
      throw new FaroError('UNKNOWN_PROBE', `"${type}" has no implementation.`, { hint: 'This is a bug in probes.mjs.' });
  }
}

function discoverRepository(repository) {
  const { files, limitations } = scanRepository(repository);
  const topLevel = new Set();
  const manifests = [];
  for (const file of files) {
    const segments = file.relative.split('/');
    if (segments.length > 1) topLevel.add(segments[0]);
    if (MANIFESTS.includes(path.basename(file.relative))) manifests.push(file);
  }
  const matches = manifests.slice(0, MAX_MATCHES).map((file) => ({
    path: file.relative,
    hash: hashFile(file),
    lines: [],
    note: `${path.basename(file.relative)} package manifest`,
  }));
  return {
    mechanism: 'file walk (repository layout and manifests)',
    match_count: manifests.length,
    matches,
    limitations,
    detail: { file_count: files.length, top_level_directories: [...topLevel].sort(), kinds: detectKinds(manifests) },
  };
}

function detectKinds(manifests) {
  const kinds = new Set();
  for (const file of manifests) {
    const base = path.basename(file.relative);
    if (base === 'package.json') kinds.add('node');
    else if (base === 'go.mod') kinds.add('go');
    else if (base === 'Cargo.toml') kinds.add('rust');
    else if (base === 'pyproject.toml') kinds.add('python');
    else if (base === 'pom.xml' || base.startsWith('build.gradle')) kinds.add('jvm');
    else if (base === 'Gemfile') kinds.add('ruby');
    else if (base === 'composer.json') kinds.add('php');
  }
  return [...kinds].sort();
}

function inspectManifests(repository) {
  const { files, limitations } = scanRepository(repository);
  const manifests = files.filter((file) => MANIFESTS.includes(path.basename(file.relative)));
  const detail = [];
  const matches = [];
  for (const file of manifests.slice(0, MAX_MATCHES)) {
    const text = readSearchable(file);
    if (text === null) {
      limitations.push(`could not read manifest ${file.relative}`);
      continue;
    }
    detail.push({ path: file.relative, ...parseManifest(path.basename(file.relative), text) });
    matches.push({ path: file.relative, hash: hashText(text), lines: [], note: 'manifest' });
  }
  return { mechanism: 'manifest parse', match_count: matches.length, matches, limitations, detail };
}

function parseManifest(name, text) {
  try {
    if (name === 'package.json' || name === 'composer.json') {
      const parsed = JSON.parse(text);
      return {
        name: parsed.name ?? null,
        version: parsed.version ?? null,
        dependencies: Object.keys({ ...parsed.dependencies, ...parsed.peerDependencies }).slice(0, 60),
        engines: parsed.engines ?? null,
      };
    }
    if (name === 'go.mod') {
      return { name: /^module\s+(\S+)/m.exec(text)?.[1] ?? null, version: /^go\s+(\S+)/m.exec(text)?.[1] ?? null, dependencies: [] };
    }
    if (name === 'Cargo.toml' || name === 'pyproject.toml') {
      return { name: /name\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? null, version: /version\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? null, dependencies: [] };
    }
    return { name: null, version: null, dependencies: [] };
  } catch {
    return { name: null, version: null, dependencies: [], note: 'manifest could not be parsed' };
  }
}

function workingTree(repository) {
  // Scoped to the registered root: a repository registered as a subdirectory must
  // not report the enclosing checkout's unrelated changes as its own. Untracked
  // work is listed file by file, because a bare `dir/` cannot be checked against
  // a scope that stops inside it.
  const status = git(repository, ['status', '--porcelain', '--untracked-files=all', '--', '.']);
  const branch = git(repository, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const toplevel = git(repository, ['rev-parse', '--show-toplevel']);
  const scoped = [];
  // Porcelain paths are relative to the git root, which is not always the
  // registered root. Everything below is reported relative to the registered
  // root, so a path can be compared to a route scope without further translation.
  let prefix = '';
  if (!toplevel.error) {
    const gitRoot = fs.realpathSync(toplevel.stdout.trim());
    const registered = fs.realpathSync(repository.absolute);
    if (gitRoot !== registered) {
      prefix = path.relative(gitRoot, registered).split(path.sep).join('/');
      scoped.push(`the registered root is a subdirectory of the git repository at ${gitRoot}; status covers this subtree only, and paths are reported relative to the registered root`);
    }
  }
  if (status.error) {
    return {
      mechanism: 'git status --porcelain --untracked-files=all',
      match_count: 0,
      matches: [],
      limitations: ['this repository is not a git working tree, so uncommitted work cannot be assessed'],
      errors: [status.error],
      detail: { clean: null, branch: null, changed_count: null, path_prefix: null },
    };
  }
  const changed = [];
  for (const line of status.stdout.split('\n')) {
    if (line.trim() === '') continue;
    const state = line.slice(0, 2).trim();
    const relative = stripPrefix(unquoteGitPath(line.slice(3).split(' -> ').pop()), prefix);
    if (relative !== null) changed.push({ state, path: relative });
  }
  return {
    mechanism: 'git status --porcelain --untracked-files=all',
    match_count: changed.length,
    matches: changed.slice(0, MAX_MATCHES).map((entry) => ({ path: entry.path, lines: [], note: `working tree: ${entry.state}` })),
    limitations: [...scoped, ...(changed.length > MAX_MATCHES ? [`working tree lists ${changed.length} changed paths; the first ${MAX_MATCHES} are recorded`] : [])],
    detail: { clean: changed.length === 0, branch: branch.error ? null : branch.stdout.trim(), changed_count: changed.length, path_prefix: prefix || null },
  };
}

/** git quotes a path holding unusual bytes. Unquote it rather than mis-scope it. */
export function unquoteGitPath(value) {
  const raw = value.trim();
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  return raw
    .slice(1, -1)
    .replace(/\\([\\"nrt])/g, (_, char) => ({ '\\': '\\', '"': '"', n: '\n', r: '\r', t: '\t' })[char]);
}

/** A path outside the registered subtree is dropped, never reported as inside it. */
function stripPrefix(value, prefix) {
  if (prefix === '') return value;
  if (value === prefix) return '';
  return value.startsWith(`${prefix}/`) ? value.slice(prefix.length + 1) : null;
}

function byPath(repository, pattern, query, mechanism) {
  const { files, limitations } = scanRepository(repository);
  const candidates = files.filter((file) => pattern.test(file.relative));
  const matches = [];
  for (const file of candidates) {
    if (matches.length >= MAX_MATCHES) break;
    if (!query) {
      const text = isSearchable(file) ? readSearchable(file) : null;
      matches.push({ path: file.relative, hash: hashFile(file), lines: [], ...secretFlag(file, text) });
      continue;
    }
    if (!isSearchable(file)) continue;
    const text = readSearchable(file);
    if (text === null) continue;
    const lines = matchLines(text, (line) => line.includes(query));
    if (lines.length > 0) matches.push({ path: file.relative, hash: hashText(text), lines, ...secretFlag(file, text) });
  }
  return {
    mechanism,
    match_count: matches.length,
    matches,
    limitations: candidates.length > MAX_MATCHES ? [...limitations, `${candidates.length} candidates matched; the first ${MAX_MATCHES} are recorded`] : limitations,
  };
}

function byContent(repository, query, test, mechanism) {
  const { files, limitations } = scanRepository(repository);
  const matches = [];
  let scanned = 0;
  let skipped = 0;
  for (const file of files) {
    if (matches.length >= MAX_MATCHES) break;
    if (!isSearchable(file)) {
      skipped += 1;
      continue;
    }
    const text = readSearchable(file);
    if (text === null) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const lines = matchLines(text, (line) => test(line, query));
    if (lines.length > 0) matches.push({ path: file.relative, hash: hashText(text), lines, ...secretFlag(file, text) });
  }
  const extra = [];
  if (skipped > 0) extra.push(`${skipped} file(s) skipped as binary, oversized, or unreadable`);
  if (matches.length >= MAX_MATCHES) extra.push(`match cap of ${MAX_MATCHES} reached; results are partial`);
  return { mechanism, match_count: matches.length, matches, limitations: [...limitations, ...extra], detail: { files_scanned: scanned } };
}

/** A flagged file still reports its location — never a byte of its content. */
function secretFlag(file, text) {
  return looksLikeSecret(file, text)
    ? { secret_suspected: true, note: 'looks like it holds credentials; content deliberately not reported' }
    : {};
}

function contractDeclares(line, query) {
  return new RegExp(
    `\\b(interface|type|abstract\\s+class|class|protocol|struct|trait|enum|@interface)\\s+${escapeRegExp(query)}\\b`,
  ).test(line);
}

function implementsContract(line, query) {
  const q = escapeRegExp(query);
  return (
    new RegExp(`\\bimplements\\s+[^{]*\\b${q}\\b`).test(line) ||
    new RegExp(`\\bextends\\s+[^{]*\\b${q}\\b`).test(line) ||
    new RegExp(`\\bimpl\\s+${q}\\s+for\\b`).test(line) ||
    new RegExp(`:\\s*${q}\\s*(\\{|$|,|\\))`).test(line) ||
    new RegExp(`\\bsatisfies\\s+${q}\\b`).test(line)
  );
}

function referencesModule(line, query) {
  const q = escapeRegExp(query);
  return (
    new RegExp(`\\b(import|from|require|use|include)\\b[^\\n]*${q}`).test(line) ||
    new RegExp(`^\\s*#include\\b[^\\n]*${q}`).test(line)
  );
}

function registrationSearch(repository, query) {
  const { files, limitations } = scanRepository(repository);
  const candidates = files.filter((file) => COMPOSITION_PATH.test(file.relative));
  const matches = [];
  for (const file of candidates) {
    if (matches.length >= MAX_MATCHES) break;
    if (!isSearchable(file)) continue;
    const text = readSearchable(file);
    if (text === null) continue;
    const lines = matchLines(text, (line) => line.includes(query));
    if (lines.length > 0) matches.push({ path: file.relative, hash: hashText(text), lines, note: 'composition root or registry' });
  }
  return {
    mechanism: 'composition-root scan (registry/index/module/container/factory paths)',
    match_count: matches.length,
    matches,
    limitations: [...limitations, `${candidates.length} composition-root candidate(s) considered`],
  };
}

/**
 * Who imports this module? Matches the module path and its basename, which is
 * how the same file is referenced across relative, aliased, and package imports.
 */
function consumerSearch(repository, target) {
  const withoutExtension = target.replace(/\.[a-z]+$/i, '');
  const basename = path.basename(withoutExtension);
  const { files, limitations } = scanRepository(repository);
  const matches = [];
  for (const file of files) {
    if (matches.length >= MAX_MATCHES) break;
    if (file.relative === target) continue;
    if (!isSearchable(file)) continue;
    const text = readSearchable(file);
    if (text === null) continue;
    const lines = matchLines(text, (line) => {
      if (!/\b(import|from|require|use|include)\b/.test(line)) return false;
      return line.includes(withoutExtension) || new RegExp(`[/'"\`]${escapeRegExp(basename)}['"\`/]`).test(line);
    });
    if (lines.length > 0) matches.push({ path: file.relative, hash: hashText(text), lines, note: `imports ${basename}` });
  }
  return {
    mechanism: 'direct consumer scan (imports of the target module)',
    match_count: matches.length,
    matches,
    limitations: [...limitations, 'consumers reached through re-exports or dependency injection are not visible to a static import scan'],
  };
}

/* ------------------------------------------------------------------ helpers */

function hashFile(file) {
  try {
    return hashText(fs.readFileSync(file.absolute, 'utf8'));
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The only external command routing runs, with fixed read-only arguments. */
function git(repository, args) {
  const result = spawnSync('git', args, { cwd: repository.absolute, encoding: 'utf8', shell: false, timeout: 10000 });
  if (result.error) return { error: result.error.message, stdout: '' };
  if (result.status !== 0) return { error: (result.stderr ?? '').trim() || `git ${args[0]} exited ${result.status}`, stdout: '' };
  return { error: null, stdout: result.stdout ?? '' };
}

function gitRevision(repository) {
  const result = git(repository, ['rev-parse', 'HEAD']);
  return result.error ? null : result.stdout.trim();
}

/**
 * Hash a repository file for a route binding.
 * @param {{absolute: string, id: string}} repository
 * @param {string} relative
 */
export function hashRepositoryFile(repository, relative) {
  const absolute = resolveInRepository(repository, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new FaroError('REPOSITORY_FILE_MISSING', `${repository.id}:${relative} does not exist.`, {
      hint: 'Bind a route only to files a probe actually found.',
      path: relative,
    });
  }
  return hashText(fs.readFileSync(absolute, 'utf8'));
}

/** Does a repository file still hash to what a route recorded? */
export function repositoryFileHash(repository, relative) {
  try {
    return hashRepositoryFile(repository, relative);
  } catch {
    return null;
  }
}
