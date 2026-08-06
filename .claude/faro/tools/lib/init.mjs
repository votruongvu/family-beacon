/**
 * `faro init` — create the canonical `.faro/` store.
 *
 * The whole store is built in a staging directory and swapped into place with a
 * single rename, so a failure anywhere leaves the repository exactly as it was.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FaroError } from './errors.mjs';
import { writeDocument } from './frontmatter.mjs';
import { SCHEMA_VERSION, FARO_VERSION } from './model.mjs';
import { REGISTRY_FILE, defaultRegistry } from './repositories.mjs';
import { validateStore } from './inspect.mjs';
import { renderAllViews } from './views.mjs';
import { newProjectMetadata } from './store.mjs';
import { STORE_DIR, createStaging, commitStore, discardStaging, writeAtomic, ensureDir, slugify, now } from './fs-safe.mjs';

const STORE_DIRECTORIES = [
  'charter',
  'knowledge',
  'requirements',
  'decisions',
  'baselines',
  'obligations',
  'signatures',
  'investigations',
  'routes',
  'intake/records',
  'intake/proposals',
  'views',
];

/**
 * Transaction staging is working state, never project history — a leftover
 * staging directory means an interrupted run, not something to commit.
 */
const STORE_GITIGNORE = ['# Faro transaction staging — working state, never committed.', '.txn/', ''].join('\n');

/**
 * @param {{ cwd: string, name?: string, force?: boolean }} options
 * @returns {{ root: string, projectId: string, name: string, created: string[] }}
 */
export function initProject(options) {
  const root = path.resolve(options.cwd);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new FaroError('NO_TARGET_DIRECTORY', `${root} is not a directory.`, {
      hint: 'Run `/faro-init` from inside the repository you want to manage.',
    });
  }
  const name = (options.name ?? deriveName(root)).trim();
  if (name === '') {
    throw new FaroError('INVALID_NAME', 'Project name cannot be empty.', {
      hint: 'Pass a name explicitly: faro init --name "My Project".',
    });
  }
  const projectId = slugify(name);

  const staging = createStaging(root);
  const created = [];
  try {
    for (const dir of STORE_DIRECTORIES) ensureDir(path.join(staging, ...dir.split('/')));

    const metadata = newProjectMetadata(name, projectId);
    writeAtomic(path.join(staging, 'project.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    created.push(`${STORE_DIR}/project.json`);

    writeAtomic(path.join(staging, '.gitignore'), STORE_GITIGNORE);
    created.push(`${STORE_DIR}/.gitignore`);

    // The repositories routing may probe. A project starts able to read only the
    // repository its own store lives in; anything wider is an explicit decision.
    writeAtomic(path.join(staging, REGISTRY_FILE), `${JSON.stringify(defaultRegistry(SCHEMA_VERSION), null, 2)}\n`);
    created.push(`${STORE_DIR}/${REGISTRY_FILE}`);

    writeAtomic(path.join(staging, 'charter', 'charter.md'), draftCharter(name));
    created.push(`${STORE_DIR}/charter/charter.md`);

    // Views are rendered against the staged store before it is published, so a
    // freshly initialised project is never reported stale.
    const stagedStore = { root, dir: staging };
    for (const view of renderAllViews(stagedStore)) created.push(`${STORE_DIR}/${view.relative}`);

    const report = validateStore(stagedStore);
    if (report.status === 'invalid') {
      throw new FaroError('INIT_VALIDATION_FAILED', 'Generated project state failed validation; nothing was written.', {
        hint: report.problems.map((problem) => `${problem.path}: ${problem.message}`).join('; '),
      });
    }
    commitStore(root, staging, options.force === true);
  } catch (err) {
    discardStaging(staging);
    throw err;
  }
  return { root, projectId, name, created: created.sort() };
}

/**
 * Prefer an explicit name, then the repository's own metadata, then the folder.
 * @param {string} root
 */
function deriveName(root) {
  const packageFile = path.join(root, 'package.json');
  if (fs.existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      if (typeof parsed.name === 'string' && parsed.name.trim() !== '') return parsed.name.trim();
    } catch {
      // A malformed package.json is the repository's business, not Faro's.
    }
  }
  return path.basename(root);
}

/**
 * The starting Project Charter.
 *
 * It is a valid *draft*: every section exists and validates, and nothing claims
 * direction the project has not stated yet. `faro inspect` reports the draft
 * status so an unfilled charter is visible rather than silently assumed.
 * @param {string} name
 */
function draftCharter(name) {
  const data = {
    faro_type: 'charter',
    schema_version: SCHEMA_VERSION,
    charter_version: 1,
    status: 'draft',
    updated_at: now(),
    origin: `faro ${FARO_VERSION} init`,
    objectives: [],
    deliveries: [],
    milestones: [],
    scope: { included: [], excluded: [] },
    principles: [],
    success_measures: [],
    stakeholders: [],
  };
  const body = [
    `# ${name} — Project Charter`,
    '',
    'This is the Project Charter: the durable direction Faro protects while requirements,',
    'knowledge, decisions, and implementation evolve. It is canonical and hand-authored.',
    'Changing it requires explicit human approval.',
    '',
    '## Vision',
    '',
    '_Not yet stated._ Describe, in a few sentences, the outcome this project exists to create.',
    '',
    '## Problem',
    '',
    '_Not yet stated._ Describe the problem that made this project worth doing.',
    '',
    '## How to fill this in',
    '',
    'Run `/faro-charter` to fill this in from a brief or a conversation, or write it yourself:',
    'objectives, deliveries, milestones, scope, principles, success measures, and stakeholders',
    'in the front matter above, using stable ids (`OBJ-01`, `DEL-01`, `MS-01`, `PRN-01`,',
    '`SM-01`, `STK-01`). Faro regenerates the views from this file — never edit them directly.',
    'Delete this section once the charter is real.',
  ].join('\n');
  return writeDocument(data, body);
}
