/**
 * The canonical `.faro/` store.
 *
 * Layout — one file per canonical item, no second file answering the same
 * question:
 *
 *   .faro/project.json                    project identity
 *   .faro/charter/charter.md              the Project Charter (Faro's North Star)
 *   .faro/charter/_history/vN.md          superseded charter versions, never rewritten
 *   .faro/knowledge/KNW-NNNN.md           reusable project knowledge
 *   .faro/requirements/REQ-NNNN/vN.md     immutable requirement versions
 *   .faro/decisions/DEC-NNNN/vN.md        immutable decision versions
 *   .faro/baselines/BL-NNNN.md            requirement-version selections
 *   .faro/obligations/OBL-NNNN.md         accepted work awaiting execution routing
 *   .faro/intake/records/INT-NNNN.md      immutable capture of an input
 *   .faro/intake/proposals/PROP-NNNN.md   proposed delta + its draft artifacts
 *   .faro/repositories.json               the repositories routing may probe
 *   .faro/signatures/SIG-NNNN.md          one admitted item compiled for routing
 *   .faro/investigations/INV-NNNN.md      how the repository was probed, and what it found
 *   .faro/routes/ROUTE-NNNN.md            the resulting execution boundary
 *   .faro/views/*.md                      generated projections, never authoritative
 *   .faro/.txn/TXN-NNNN/                  transaction staging — transient working state
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { readDocument, writeDocument } from './frontmatter.mjs';
import { validate } from './schema.mjs';
import { SCHEMAS, REQUIRED_SECTIONS, ID_PREFIXES, SCHEMA_VERSION, FARO_VERSION, projectSchema } from './model.mjs';
import {
  STORE_DIR,
  findProjectRoot,
  resolveInside,
  readUtf8,
  writeAtomic,
  hashText,
  listDirectories,
  listFiles,
  now,
} from './fs-safe.mjs';

/** @typedef {{ root: string, dir: string }} Store */

/**
 * Open the Faro store that owns `startDir`.
 * @param {string} startDir
 * @returns {Store}
 */
export function openStore(startDir) {
  const root = findProjectRoot(startDir);
  if (!root) {
    throw new FaroError('NO_PROJECT', `No Faro project found in ${path.resolve(startDir)} or any parent directory.`, {
      hint: 'Run `faro init` in your repository root to create one.',
    });
  }
  return { root, dir: path.join(root, STORE_DIR) };
}

/**
 * @param {Store} store
 * @param {string} relative POSIX-style path relative to `.faro/`
 */
export function storePath(store, relative) {
  return resolveInside(store.dir, relative);
}

/** @param {Store} store @param {string} relative */
export function exists(store, relative) {
  return fs.existsSync(storePath(store, relative));
}

/* ----------------------------------------------------------------- reading */

/**
 * Read and validate one canonical Markdown item.
 * @param {Store} store
 * @param {string} relative
 * @param {keyof SCHEMAS} type
 * @returns {{ data: Record<string, any>, body: string, relative: string, hash: string, issues: {path:string,message:string}[] }}
 */
export function readItem(store, relative, type) {
  const file = storePath(store, relative);
  const raw = readUtf8(file);
  const { data, body } = readDocument(raw, relative);
  const issues = validate(data, SCHEMAS[type], '');
  for (const heading of REQUIRED_SECTIONS[type] ?? []) {
    if (sectionText(body, heading) === '') {
      issues.push({ path: `body.## ${heading}`, message: 'section is missing or empty' });
    }
  }
  return { data, body, relative, hash: hashText(raw), issues };
}

/**
 * Write a canonical Markdown item atomically.
 * @param {Store} store
 * @param {string} relative
 * @param {Record<string, any>} data
 * @param {string} body
 */
export function writeItem(store, relative, data, body) {
  const text = writeDocument(data, body);
  writeAtomic(storePath(store, relative), text);
  return { relative, hash: hashText(text) };
}

/** Extract the text under a `## Heading`, excluding the heading itself. */
export function sectionText(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return '';
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join('\n').trim();
}

/* -------------------------------------------------------------- inventory */

/** @param {Store} store @returns {{ id: string, versions: number[], latest: number }[]} */
export function listVersionedItems(store, folder, pattern) {
  return listDirectories(storePath(store, folder))
    .filter((name) => pattern.test(name))
    .map((id) => {
      const versions = listFiles(storePath(store, `${folder}/${id}`))
        .map((file) => /^v(\d+)\.md$/.exec(file))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))
        .sort((a, b) => a - b);
      return { id, versions, latest: versions[versions.length - 1] ?? 0 };
    });
}

/** @param {Store} store */
export function listRequirements(store) {
  return listVersionedItems(store, 'requirements', /^REQ-\d{4}$/);
}

/** @param {Store} store */
export function listDecisions(store) {
  return listVersionedItems(store, 'decisions', /^DEC-\d{4}$/);
}

/** @param {Store} store */
export function listKnowledge(store) {
  return listFiles(storePath(store, 'knowledge'))
    .filter((name) => /^KNW-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listBaselines(store) {
  return listFiles(storePath(store, 'baselines'))
    .filter((name) => /^BL-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listObligations(store) {
  return listFiles(storePath(store, 'obligations'))
    .filter((name) => /^OBL-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listSignatures(store) {
  return listFiles(storePath(store, 'signatures'))
    .filter((name) => /^SIG-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listInvestigations(store) {
  return listFiles(storePath(store, 'investigations'))
    .filter((name) => /^INV-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listRoutes(store) {
  return listFiles(storePath(store, 'routes'))
    .filter((name) => /^ROUTE-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listIntakeRecords(store) {
  return listFiles(storePath(store, 'intake/records'))
    .filter((name) => /^INT-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/** @param {Store} store */
export function listProposals(store) {
  return listFiles(storePath(store, 'intake/proposals'))
    .filter((name) => /^PROP-\d{4}\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ''));
}

/**
 * Allocate the next free identifier for a kind. Ids are dense and never reused,
 * which is what makes `REQ-0041@2` a durable reference.
 * @param {Store} store
 * @param {'requirement'|'decision'|'knowledge'|'baseline'|'obligation'|'intake'|'proposal'|'signature'|'investigation'|'route'} kind
 */
export function nextId(store, kind) {
  const existing = {
    requirement: () => listRequirements(store).map((item) => item.id),
    decision: () => listDecisions(store).map((item) => item.id),
    knowledge: () => listKnowledge(store),
    baseline: () => listBaselines(store),
    obligation: () => listObligations(store),
    intake: () => listIntakeRecords(store),
    proposal: () => listProposals(store),
    signature: () => listSignatures(store),
    investigation: () => listInvestigations(store),
    route: () => listRoutes(store),
  }[kind]();
  const prefix = ID_PREFIXES[kind];
  const highest = existing.reduce((max, id) => {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

/* ---------------------------------------------------------------- project */

/** @param {Store} store */
export function readProject(store) {
  const file = storePath(store, 'project.json');
  const raw = readUtf8(file);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new FaroError('MALFORMED_JSON', `project.json is not valid JSON: ${err.message}`, {
      hint: 'Fix the syntax or restore the file from version control.',
      path: file,
    });
  }
  return { data, issues: validate(data, projectSchema, ''), hash: hashText(raw) };
}

/** @param {Store} store @param {Record<string, any>} data */
export function writeProject(store, data) {
  writeAtomic(storePath(store, 'project.json'), `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Advance the store-integrity anchor. Called inside a transaction's staged store,
 * so a failed transaction never moves the revision.
 *
 * There is no `updatedAt`: a wall-clock stamp that changed on every commit was
 * derived information with no owner, and binding to it would have expired every
 * open proposal for reasons that had nothing to do with their reasoning.
 *
 * @param {Store} store
 * @param {string} transactionId
 */
export function advanceStoreRevision(store, transactionId) {
  const { data } = readProject(store);
  writeProject(store, { ...data, storeRevision: (data.storeRevision ?? 0) + 1, lastTransaction: transactionId });
}

/** @param {string} name @param {string} projectId */
export function newProjectMetadata(name, projectId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    name,
    faroVersion: FARO_VERSION,
    createdAt: now(),
    storeRevision: 0,
    lastTransaction: null,
  };
}

/* ------------------------------------------------------------- convenience */

/** @param {Store} store */
export function readCharter(store) {
  return readItem(store, 'charter/charter.md', 'charter');
}
