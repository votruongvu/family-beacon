/**
 * Filesystem access with the guarantees Faro depends on.
 *
 * Three rules hold everywhere: UTF-8 only, no write escapes the `.faro/` store
 * (symlinks included), and a failed write never leaves a half-updated file or a
 * half-created project.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FaroError } from './errors.mjs';

export const STORE_DIR = '.faro';

let tempCounter = 0;

/**
 * Walk up from `startDir` until a directory containing `.faro/` is found.
 * @param {string} startDir
 * @returns {string|null} the project root, or null when there is no Faro project
 */
export function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(current, STORE_DIR, 'project.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve a store-relative path, refusing anything that would land outside the
 * store — including through an existing symlink.
 * @param {string} root real path of the directory writes are confined to
 * @param {string} relativePath POSIX-style path relative to `root`
 * @returns {string} an absolute, platform-native path inside `root`
 */
export function resolveInside(root, relativePath) {
  const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  const target = path.resolve(rootReal, ...relativePath.split('/').filter((part) => part !== ''));
  const relative = path.relative(rootReal, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new FaroError('PATH_ESCAPE', `"${relativePath}" resolves outside the Faro store.`, {
      hint: 'Canonical paths must stay inside .faro/.',
      path: relativePath,
    });
  }
  let probe = target;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  if (fs.existsSync(probe)) {
    const realProbe = fs.realpathSync(probe);
    const realRelative = path.relative(rootReal, realProbe);
    if (realRelative !== '' && (realRelative.startsWith('..') || path.isAbsolute(realRelative))) {
      throw new FaroError('PATH_SYMLINK_ESCAPE', `"${relativePath}" is reached through a symlink that leaves the Faro store.`, {
        hint: 'Faro refuses to write through symlinks that point outside the project store.',
        path: relativePath,
      });
    }
  }
  return target;
}

/** @param {string} file */
export function readUtf8(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new FaroError('FILE_MISSING', `Expected file is missing: ${file}`, {
        hint: 'Run `/faro-init` to create a project, or restore the file from version control.',
        path: file,
      });
    }
    throw err;
  }
}

/** @param {string} dir */
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write UTF-8 content through a temporary file and an atomic rename, so a
 * reader never observes a partially written canonical file.
 * @param {string} file
 * @param {string} content
 */
export function writeAtomic(file, content) {
  const dir = path.dirname(file);
  ensureDir(dir);
  tempCounter += 1;
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${tempCounter}.tmp`);
  const handle = fs.openSync(temp, 'w');
  try {
    fs.writeFileSync(handle, content, { encoding: 'utf8' });
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

/** @param {string} text */
export function hashText(text) {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** @param {string} dir @returns {string[]} sorted names of direct child directories */
export function listDirectories(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** @param {string} dir @param {string} [ext] @returns {string[]} sorted file names */
export function listFiles(dir, ext = '.md') {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Create an empty staging directory for a project-wide write.
 * @param {string} projectRoot
 */
export function createStaging(projectRoot) {
  const staging = path.join(projectRoot, `.faro.staging-${process.pid}-${Date.now().toString(36)}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  return staging;
}

/**
 * Swap a fully built staging directory into place as `.faro/`.
 *
 * The previous store (when `force` is set) is moved aside first and only
 * removed once the new store is in place, so a failure mid-swap restores the
 * project rather than leaving it half initialised.
 *
 * @param {string} projectRoot
 * @param {string} staging
 * @param {boolean} force replace an existing store
 */
export function commitStore(projectRoot, staging, force) {
  const target = path.join(projectRoot, STORE_DIR);
  const exists = fs.existsSync(target);
  if (exists && !force) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new FaroError('STORE_EXISTS', `${STORE_DIR}/ already exists in ${projectRoot}.`, {
      hint: 'Re-run with --force to replace the existing store, or run `/faro-inspect` to review it.',
      path: target,
    });
  }
  const backup = exists ? `${target}.replaced-${process.pid}-${Date.now().toString(36)}` : null;
  if (backup) fs.renameSync(target, backup);
  try {
    fs.renameSync(staging, target);
  } catch (err) {
    if (backup && fs.existsSync(backup)) fs.renameSync(backup, target);
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  if (backup) fs.rmSync(backup, { recursive: true, force: true });
}

/** @param {string} dir */
export function discardStaging(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Deterministic clock. Tests pin it with FARO_NOW so generated files are stable. */
export function now() {
  const pinned = process.env.FARO_NOW;
  if (pinned) return pinned;
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** @param {string} name @returns {string} a stable, machine-safe project id */
export function slugify(name) {
  const slug = String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop combining marks left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug === '' ? 'faro-project' : slug;
}
