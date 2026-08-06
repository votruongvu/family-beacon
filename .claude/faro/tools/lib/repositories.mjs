/**
 * The repositories Faro is allowed to probe.
 *
 * Routing reads code, so the set of roots it may touch has to be explicit and
 * small. `.faro/repositories.json` names them; a project that never registers
 * one still gets a sensible default — the repository the Faro store lives in —
 * so routing works out of the box without granting access to anything else.
 *
 * Every path a probe touches is resolved through `resolveInRepository`, which
 * refuses absolute paths, `..` escapes, and symlinks that leave the root. There
 * is no code path that reads outside a registered repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { validate, s } from './schema.mjs';
import { readUtf8, writeAtomic } from './fs-safe.mjs';
import { storePath, exists } from './store.mjs';

export const REGISTRY_FILE = 'repositories.json';
export const REGISTRY_ROLES = ['primary', 'supporting', 'reference'];

/** Directories never worth probing: dependencies, build output, and tool state. */
export const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.faro',
  '.hg',
  '.svn',
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'out-tsc',
  'target',
  'bin',
  'obj',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.gradle',
  '.idea',
  '.vscode',
  'Pods',
  'DerivedData',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.pytest_cache',
  '.factory',
  '.terraform',
]);

const registrySchema = s.object(
  {
    schemaVersion: s.integer({ min: 1 }),
    repositories: s.list(
      s.object(
        {
          id: s.string({ pattern: /^[a-z0-9][a-z0-9-]*$/ }),
          root: s.string(),
          role: s.enum(REGISTRY_ROLES),
          description: s.string(),
        },
        ['id', 'root', 'role', 'description'],
      ),
      { min: 1 },
    ),
  },
  ['schemaVersion', 'repositories'],
);

/**
 * The default registry for a project that has not declared one: the repository
 * the Faro store itself lives in, and nothing else.
 * @param {number} schemaVersion
 */
export function defaultRegistry(schemaVersion) {
  return {
    schemaVersion,
    repositories: [
      { id: 'app', root: '.', role: 'primary', description: 'The repository this Faro project lives in.' },
    ],
  };
}

/**
 * @param {import('./store.mjs').Store} store
 * @returns {{ repositories: {id:string,root:string,role:string,description:string,absolute:string,present:boolean}[],
 *             declared: boolean, issues: {path:string,message:string}[] }}
 */
export function readRepositories(store) {
  let data;
  let declared = false;
  if (exists(store, REGISTRY_FILE)) {
    declared = true;
    const raw = readUtf8(storePath(store, REGISTRY_FILE));
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new FaroError('MALFORMED_JSON', `${REGISTRY_FILE} is not valid JSON: ${err.message}`, {
        hint: 'Fix the syntax or delete the file to fall back to the default single-repository registry.',
        path: `.faro/${REGISTRY_FILE}`,
      });
    }
  } else {
    data = defaultRegistry(1);
  }

  const issues = validate(data, registrySchema, '');
  const seen = new Set();
  const repositories = (data.repositories ?? []).map((entry) => {
    if (seen.has(entry.id)) issues.push({ path: `repositories.${entry.id}`, message: 'is declared twice' });
    seen.add(entry.id);
    const absolute = path.resolve(store.root, ...String(entry.root).split('/'));
    return { ...entry, absolute, present: fs.existsSync(absolute) && fs.statSync(absolute).isDirectory() };
  });
  return { repositories, declared, issues };
}

/**
 * @param {import('./store.mjs').Store} store
 * @param {string} id
 */
export function resolveRepository(store, id) {
  const { repositories } = readRepositories(store);
  const repository = repositories.find((entry) => entry.id === id);
  if (!repository) {
    throw new FaroError('REPOSITORY_NOT_REGISTERED', `"${id}" is not a registered repository.`, {
      hint: `Registered: ${repositories.map((entry) => entry.id).join(', ') || '(none)'}. Declare more in .faro/${REGISTRY_FILE}.`,
    });
  }
  if (!repository.present) {
    throw new FaroError('REPOSITORY_MISSING', `Repository "${id}" is registered at ${repository.root}, which does not exist.`, {
      hint: 'Check the path in .faro/repositories.json — roots are resolved relative to the project root.',
      path: repository.root,
    });
  }
  return repository;
}

/**
 * Resolve a repository-relative path, refusing anything that leaves the root.
 * @param {{absolute: string, id: string}} repository
 * @param {string} relative POSIX-style path relative to the repository root
 */
export function resolveInRepository(repository, relative) {
  if (path.isAbsolute(relative)) {
    throw new FaroError('PATH_ABSOLUTE', `"${relative}" must be relative to repository "${repository.id}".`, {
      hint: 'Repository paths are always relative to the registered root.',
    });
  }
  const rootReal = fs.realpathSync(repository.absolute);
  const target = path.resolve(rootReal, ...relative.split('/').filter((part) => part !== ''));
  const inside = path.relative(rootReal, target);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new FaroError('PATH_ESCAPE', `"${relative}" resolves outside repository "${repository.id}".`, {
      hint: 'Routing may only read inside registered repository roots.',
      path: relative,
    });
  }
  if (fs.existsSync(target)) {
    const realTarget = fs.realpathSync(target);
    const realInside = path.relative(rootReal, realTarget);
    if (realInside !== '' && (realInside.startsWith('..') || path.isAbsolute(realInside))) {
      throw new FaroError('PATH_SYMLINK_ESCAPE', `"${relative}" is reached through a symlink that leaves repository "${repository.id}".`, {
        hint: 'Faro refuses to read through symlinks that point outside a registered root.',
        path: relative,
      });
    }
  }
  return target;
}

/** @param {import('./store.mjs').Store} store @param {Record<string, any>} data */
export function writeRepositories(store, data) {
  writeAtomic(storePath(store, REGISTRY_FILE), `${JSON.stringify(data, null, 2)}\n`);
}
