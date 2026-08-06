/**
 * All-or-nothing mutation of the canonical store.
 *
 * A proposal can write several artifacts. Individually atomic writes are not
 * enough: a crash between them leaves every file valid and the store as a whole
 * wrong. So a mutation runs as a transaction.
 *
 *   .faro/.txn/TXN-NNNN/
 *     manifest.json      what this transaction intends, and its digests
 *     store/             a full copy of .faro with the mutations applied
 *     before/            the prior content of every file the commit will touch
 *
 * The staged copy is a real store, so every existing validator, cross-reference
 * check, and view renderer runs against the *result* before anything is exposed.
 * Only once the staged whole-store state is known valid does the manifest move to
 * `committing` and the changed files get copied into place.
 *
 * Recovery is deterministic rather than a guess:
 *
 *   staging     nothing was exposed        → discard the staging
 *   committing  every file already at its after-digest → the commit finished; discard
 *   committing  otherwise                  → ROLL BACK to the before-images
 *   committed   leftover staging           → discard
 *
 * Rolling back rather than forward is the deliberate choice: an operation the
 * user watched fail should not silently complete itself later. The before-images
 * make it exact. A file matching neither its recorded before- nor after-digest
 * was changed by something else mid-commit; that is reported, never resolved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { TRANSACTION_ID, transactionSchema } from './model.mjs';
import { validate } from './schema.mjs';
import { hashText, readUtf8, writeAtomic, ensureDir, now } from './fs-safe.mjs';

const TXN_DIR = '.txn';
const MANIFEST = 'manifest.json';

/** Test-only failure injection. Never set in normal use. */
function shouldFail(stage) {
  return process.env.FARO_TEST_FAIL_AT === stage;
}

function injected(stage) {
  // `crash-during-commit` stands in for the process dying: it skips the
  // in-process rollback so a `committing` transaction is left on disk, which is
  // the only way to exercise `faro recover` deterministically.
  const code = stage === 'crash-during-commit' ? 'TEST_SIMULATED_CRASH' : 'TEST_INJECTED_FAILURE';
  return new FaroError(code, `Injected failure at "${stage}" (FARO_TEST_FAIL_AT).`, {
    hint: 'This failure is deliberate; it exists so transaction recovery can be tested.',
  });
}

/* ------------------------------------------------------------- allocation */

/** @param {import('./store.mjs').Store} store */
function nextTransactionId(store) {
  let highest = 0;
  const consider = (id) => {
    const match = /^TXN-(\d+)$/.exec(id ?? '');
    if (match) highest = Math.max(highest, Number.parseInt(match[1], 10));
  };
  const dir = path.join(store.dir, TXN_DIR);
  if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir)) consider(entry);
  try {
    consider(JSON.parse(readUtf8(path.join(store.dir, 'project.json'))).lastTransaction);
  } catch {
    // A missing or unreadable project.json is reported by `faro inspect`; id
    // allocation falls back to whatever the staging directory shows.
  }
  return `TXN-${String(highest + 1).padStart(4, '0')}`;
}

/* -------------------------------------------------------------- lifecycle */

/**
 * Copy the live store into an isolated staging area.
 *
 * @param {import('./store.mjs').Store} store
 * @param {string} proposalId
 * @returns {{ id: string, dir: string, staged: import('./store.mjs').Store, storeRevisionBefore: number }}
 */
export function beginTransaction(store, proposalId) {
  const id = nextTransactionId(store);
  const dir = path.join(store.dir, TXN_DIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);

  let storeRevisionBefore = 0;
  try {
    storeRevisionBefore = JSON.parse(readUtf8(path.join(store.dir, 'project.json'))).storeRevision ?? 0;
  } catch {
    // Same as above: an unreadable project.json fails validation later.
  }

  // The manifest is written before the copy, so a failure while staging still
  // leaves a record recovery can read and discard rather than an orphan directory.
  writeManifest(dir, {
    id,
    proposal: proposalId,
    status: 'staging',
    started_at: now(),
    store_revision_before: storeRevisionBefore,
    mutations: [],
  });

  try {
    // The staging area lives inside the store, so the copy skips it explicitly
    // rather than recursing into itself.
    copyTree(store.dir, path.join(dir, 'store'), TXN_DIR);
  } catch (err) {
    discard(dir);
    throw err;
  }

  return { id, dir, staged: { root: store.root, dir: path.join(dir, 'store') }, storeRevisionBefore };
}

/** Recursive copy that skips one top-level entry — the staging directory itself. */
function copyTree(source, target, excludeTopLevel) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === excludeTopLevel) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to, null);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * Compare the staged store against the live one and record the mutation set.
 *
 * Called after every staged artifact has been validated, so the digests written
 * here describe a state that is already known good.
 *
 * @param {import('./store.mjs').Store} store
 * @param {{ id: string, dir: string, storeRevisionBefore: number }} txn
 * @param {string} proposalId
 */
export function finalizeStaging(store, txn, proposalId) {
  if (shouldFail('after-stage')) throw injected('after-stage');

  const stagedDir = path.join(txn.dir, 'store');
  const before = collectFiles(store.dir, TXN_DIR);
  const after = collectFiles(stagedDir);

  const removed = [...before.keys()].filter((file) => !after.has(file));
  if (removed.length > 0) {
    throw new FaroError('TRANSACTION_WOULD_DELETE', `Applying ${proposalId} would remove canonical files: ${removed.join(', ')}.`, {
      hint: 'Faro never deletes canonical artifacts. This is a bug in the mutation plan.',
    });
  }

  const mutations = [];
  for (const [file, hash] of after) {
    const previous = before.get(file);
    if (previous !== hash) mutations.push({ path: file, before: previous ?? null, after: hash });
  }
  mutations.sort((a, b) => a.path.localeCompare(b.path));

  if (mutations.length === 0) {
    throw new FaroError('TRANSACTION_EMPTY', `Applying ${proposalId} would change nothing.`, {
      hint: 'A proposal must produce at least one canonical change.',
    });
  }

  if (shouldFail('after-validate')) throw injected('after-validate');

  // Snapshot what the commit is about to overwrite, so a failure part-way through
  // can restore the exact prior bytes rather than approximate them.
  for (const mutation of mutations) {
    if (mutation.before === null) continue;
    const target = path.join(txn.dir, 'before', ...mutation.path.split('/'));
    ensureDir(path.dirname(target));
    fs.copyFileSync(path.join(store.dir, ...mutation.path.split('/')), target);
  }

  writeManifest(txn.dir, {
    id: txn.id,
    proposal: proposalId,
    status: 'committing',
    started_at: readManifest(txn.dir).started_at,
    store_revision_before: txn.storeRevisionBefore,
    mutations,
  });
  return mutations;
}

/**
 * Expose the validated staged state.
 * @param {import('./store.mjs').Store} store
 * @param {{ id: string, dir: string }} txn
 */
export function commitTransaction(store, txn) {
  const manifest = readManifest(txn.dir);
  const stagedDir = path.join(txn.dir, 'store');
  try {
    let written = 0;
    for (const mutation of manifest.mutations) {
      writeAtomic(path.join(store.dir, ...mutation.path.split('/')), readUtf8(path.join(stagedDir, ...mutation.path.split('/'))));
      written += 1;
      if (written === 1 && manifest.mutations.length > 1) {
        if (shouldFail('during-commit')) throw injected('during-commit');
        if (shouldFail('crash-during-commit')) throw injected('crash-during-commit');
      }
    }
  } catch (err) {
    // A crash cannot run cleanup, so the simulation must not either — the
    // `committing` transaction is left on disk for `faro recover`.
    if (err.code === 'TEST_SIMULATED_CRASH') throw err;
    // The commit is the only phase that can expose a partial result, so it is
    // the only one that undoes its own work before giving up.
    rollback(store, txn.dir, manifest);
    throw err;
  }
  writeManifest(txn.dir, { ...manifest, status: 'committed', committed_at: now() });
  discard(txn.dir);
  return manifest.mutations.map((mutation) => mutation.path);
}

/**
 * Discard a transaction that has not started committing.
 *
 * A transaction already in `committing` is left on disk untouched: it owns
 * exposed state, and only rollback or recovery may resolve it.
 * @param {{dir: string}} txn
 */
export function abortTransaction(txn) {
  try {
    if (readManifest(txn.dir).status === 'committing') return false;
  } catch {
    // An unreadable manifest means nothing was ever staged successfully.
  }
  discard(txn.dir);
  return true;
}

/** Restore every touched path to its before-image, then discard the transaction. */
function rollback(store, dir, manifest) {
  for (const mutation of manifest.mutations) {
    const target = path.join(store.dir, ...mutation.path.split('/'));
    if (mutation.before === null) {
      fs.rmSync(target, { force: true });
      continue;
    }
    const image = path.join(dir, 'before', ...mutation.path.split('/'));
    if (fs.existsSync(image)) writeAtomic(target, readUtf8(image));
  }
  discard(dir);
}

/* --------------------------------------------------------------- recovery */

/**
 * Transactions left on disk. An empty list means the store is settled.
 * @param {import('./store.mjs').Store} store
 * @returns {{ id: string, dir: string, manifest: Record<string, any> | null, error?: string }[]}
 */
function pendingTransactions(store) {
  const dir = path.join(store.dir, TXN_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && TRANSACTION_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const txnDir = path.join(dir, id);
      try {
        const manifest = readManifest(txnDir);
        const issues = validate(manifest, transactionSchema, '');
        if (issues.length > 0) {
          return { id, dir: txnDir, manifest: null, error: issues.map((issue) => `${issue.path} ${issue.message}`).join('; ') };
        }
        return { id, dir: txnDir, manifest };
      } catch (err) {
        return { id, dir: txnDir, manifest: null, error: err.message };
      }
    });
}

/**
 * Resolve every pending transaction deterministically.
 *
 * @param {import('./store.mjs').Store} store
 * @param {{ dryRun?: boolean }} [options]
 * @returns {{ id: string, action: 'discarded'|'rolled-back'|'already-applied'|'ambiguous', detail: string }[]}
 */
export function recoverTransactions(store, options = {}) {
  const results = [];
  for (const pending of pendingTransactions(store)) {
    if (!pending.manifest) {
      results.push({ id: pending.id, action: 'ambiguous', detail: `the transaction manifest is unreadable — ${pending.error}` });
      continue;
    }
    const { manifest } = pending;

    if (manifest.status === 'staging') {
      if (!options.dryRun) discard(pending.dir);
      results.push({ id: pending.id, action: 'discarded', detail: 'staging never reached commit; no canonical file was exposed' });
      continue;
    }
    if (manifest.status === 'committed') {
      if (!options.dryRun) discard(pending.dir);
      results.push({ id: pending.id, action: 'discarded', detail: 'the commit completed; leftover staging removed' });
      continue;
    }

    // status === 'committing': the process died while exposing the commit.
    const exposed = [];
    const conflicts = [];
    for (const mutation of manifest.mutations) {
      const target = path.join(store.dir, ...mutation.path.split('/'));
      const current = fs.existsSync(target) ? hashText(readUtf8(target)) : null;
      if (current === mutation.after) exposed.push(mutation.path);
      else if (current !== (mutation.before ?? null)) {
        conflicts.push(`${mutation.path} matches neither its recorded before- nor after-digest`);
      }
    }

    if (conflicts.length > 0) {
      results.push({
        id: pending.id,
        action: 'ambiguous',
        detail: `${conflicts.join('; ')}. The store was modified while ${pending.id} was committing.`,
      });
      continue;
    }
    if (exposed.length === manifest.mutations.length) {
      if (!options.dryRun) discard(pending.dir);
      results.push({ id: pending.id, action: 'already-applied', detail: 'the commit had completed; leftover staging removed' });
      continue;
    }
    if (options.dryRun) {
      results.push({
        id: pending.id,
        action: 'rolled-back',
        detail: `${exposed.length} of ${manifest.mutations.length} mutation(s) were exposed and would be reverted to the prior state`,
      });
      continue;
    }
    rollback(store, pending.dir, manifest);
    results.push({
      id: pending.id,
      action: 'rolled-back',
      detail: `reverted ${exposed.length} exposed mutation(s); the project is back at store revision ${manifest.store_revision_before}`,
    });
  }
  return results;
}

/* ---------------------------------------------------------------- helpers */

/**
 * Remove one transaction, and the `.txn/` parent once it is empty — a settled
 * store shows no trace of transactions that finished.
 */
function discard(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const parent = path.dirname(dir);
  if (path.basename(parent) !== TXN_DIR) return;
  try {
    if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  } catch {
    // A concurrent transaction repopulated it; leaving it is correct.
  }
}

function writeManifest(dir, manifest) {
  writeAtomic(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(dir) {
  return JSON.parse(readUtf8(path.join(dir, MANIFEST)));
}

/** Every file under `dir` as POSIX-relative path → content hash. */
function collectFiles(dir, exclude) {
  /** @type {Map<string, string>} */
  const files = new Map();
  if (!fs.existsSync(dir)) return files;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (exclude && current === dir && entry.name === exclude) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.set(path.relative(dir, full).split(path.sep).join('/'), hashText(readUtf8(full)));
    }
  };
  walk(dir);
  return files;
}
