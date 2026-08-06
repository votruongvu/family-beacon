/**
 * Front-matter reader/writer for Faro canonical files.
 *
 * Faro stores one canonical item per Markdown file: machine-readable fields in
 * the front matter, human narrative in the body. To stay dependency-free the
 * parser accepts a deliberately small, strict YAML subset and rejects anything
 * outside it with an actionable error rather than guessing.
 *
 * Supported:
 *   key: scalar                     strings, numbers, booleans, null
 *   key: "quoted"  /  key: 'quoted'
 *   key: |                          block scalar (literal, newline preserved)
 *   key: []  /  key: [a, b]         inline empty and inline scalar lists
 *   key:                            nested map (indented children)
 *     child: value
 *   key:                            list of scalars
 *     - value
 *   key:                            list of maps
 *     - id: X
 *       title: Y
 *   # full-line and trailing comments (outside quotes)
 *
 * Not supported (rejected, never silently reinterpreted): anchors, aliases,
 * multi-document streams, flow maps, tabs for indentation, `>` folded scalars.
 */
import { FaroError } from './errors.mjs';

const DELIMITER = '---';
const INDENT = 2;

/**
 * Split a Markdown file into front matter and body.
 * @param {string} text raw file contents
 * @param {string} [source] path used in error messages
 * @returns {{ data: Record<string, any>, body: string }}
 */
export function readDocument(text, source = '<memory>') {
  const normalised = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalised.startsWith(`${DELIMITER}\n`)) {
    throw new FaroError('FRONT_MATTER_MISSING', `${source} does not start with a "---" front-matter block.`, {
      hint: 'Every canonical Faro file begins with a --- front-matter block followed by the Markdown body.',
      path: source,
    });
  }
  const end = normalised.indexOf(`\n${DELIMITER}\n`, DELIMITER.length);
  const endOfFile = normalised.endsWith(`\n${DELIMITER}`) ? normalised.length - DELIMITER.length - 1 : -1;
  const close = end === -1 ? endOfFile : end;
  if (close === -1) {
    throw new FaroError('FRONT_MATTER_UNTERMINATED', `${source} has an unterminated front-matter block.`, {
      hint: 'Close the front matter with a line containing only "---".',
      path: source,
    });
  }
  const raw = normalised.slice(DELIMITER.length + 1, close);
  const body = normalised.slice(Math.min(close + DELIMITER.length + 2, normalised.length));
  return { data: parseYaml(raw, source), body: body.replace(/^\n+/, '') };
}

/**
 * Render front matter + body back into a Markdown file.
 * @param {Record<string, any>} data
 * @param {string} body
 * @returns {string}
 */
export function writeDocument(data, body) {
  const trimmed = body.replace(/\s+$/, '');
  return `${DELIMITER}\n${stringifyYaml(data)}${DELIMITER}\n\n${trimmed}\n`;
}

/**
 * Parse the supported YAML subset.
 * @param {string} text
 * @param {string} source
 * @returns {Record<string, any>}
 */
export function parseYaml(text, source = '<memory>') {
  const lines = [];
  text.split('\n').forEach((line, index) => {
    if (line.includes('\t')) {
      throw new FaroError('FRONT_MATTER_TAB', `${source} line ${index + 1} indents with a tab.`, {
        hint: 'Use two spaces per indent level. Tabs are not valid YAML indentation.',
        path: source,
      });
    }
    lines.push({ raw: line, number: index + 1 });
  });
  const { value, next } = parseBlock(lines, 0, 0, source);
  if (next < lines.length) {
    const line = lines[next];
    throw new FaroError('FRONT_MATTER_INDENT', `${source} line ${line.number} has unexpected indentation.`, {
      hint: `Unparsed content: ${line.raw.trim()}`,
      path: source,
    });
  }
  return value ?? {};
}

/** @returns {{ value: any, next: number }} */
function parseBlock(lines, start, indent, source) {
  let index = skipBlank(lines, start);
  if (index >= lines.length) return { value: null, next: index };
  const width = indentOf(lines[index].raw);
  if (width < indent) return { value: null, next: index };
  return lines[index].raw.slice(width).startsWith('- ') || lines[index].raw.slice(width).trim() === '-'
    ? parseSequence(lines, index, width, source)
    : parseMapping(lines, index, width, source);
}

function parseMapping(lines, start, indent, source) {
  const result = {};
  let index = start;
  while (index < lines.length) {
    index = skipBlank(lines, index);
    if (index >= lines.length) break;
    const line = lines[index];
    const width = indentOf(line.raw);
    if (width < indent) break;
    if (width > indent) {
      throw new FaroError('FRONT_MATTER_INDENT', `${source} line ${line.number} is indented unexpectedly.`, {
        hint: `Expected ${indent} spaces before "${line.raw.trim()}".`,
        path: source,
      });
    }
    const content = stripComment(line.raw.slice(width));
    const colon = findKeySeparator(content);
    if (colon === -1) {
      throw new FaroError('FRONT_MATTER_SYNTAX', `${source} line ${line.number} is not a "key: value" pair.`, {
        hint: `Offending line: ${line.raw.trim()}`,
        path: source,
      });
    }
    const key = content.slice(0, colon).trim();
    const inline = content.slice(colon + 1).trim();
    index += 1;
    if (inline === '|') {
      const block = readBlockScalar(lines, index, indent + INDENT);
      result[key] = block.value;
      index = block.next;
    } else if (inline === '') {
      const child = parseBlock(lines, index, indent + INDENT, source);
      result[key] = child.value === null ? null : child.value;
      index = child.next;
    } else {
      result[key] = parseScalar(inline, line.number, source);
    }
  }
  return { value: result, next: index };
}

function parseSequence(lines, start, indent, source) {
  const result = [];
  let index = start;
  while (index < lines.length) {
    index = skipBlank(lines, index);
    if (index >= lines.length) break;
    const line = lines[index];
    const width = indentOf(line.raw);
    if (width < indent) break;
    const content = stripComment(line.raw.slice(width));
    if (!content.startsWith('-')) break;
    const item = content.slice(1).trim();
    index += 1;
    if (item === '') {
      const child = parseBlock(lines, index, indent + INDENT, source);
      result.push(child.value);
      index = child.next;
      continue;
    }
    const colon = findKeySeparator(item);
    if (colon === -1) {
      result.push(parseScalar(item, line.number, source));
      continue;
    }
    // "- key: value" starts a map whose remaining keys align under the dash.
    const inner = { raw: ' '.repeat(width + 2) + item, number: line.number };
    const rest = [inner, ...lines.slice(index)];
    const child = parseMapping(rest, 0, width + 2, source);
    result.push(child.value);
    index += child.next - 1;
  }
  return { value: result, next: index };
}

function readBlockScalar(lines, start, indent) {
  const collected = [];
  let index = start;
  while (index < lines.length) {
    const { raw } = lines[index];
    if (raw.trim() === '') {
      collected.push('');
      index += 1;
      continue;
    }
    if (indentOf(raw) < indent) break;
    collected.push(raw.slice(indent));
    index += 1;
  }
  while (collected.length && collected[collected.length - 1] === '') collected.pop();
  return { value: collected.join('\n'), next: index };
}

function parseScalar(token, lineNumber, source) {
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) {
    return token.slice(1, -1).replace(/''/g, "'");
  }
  if (token.startsWith('[')) {
    if (!token.endsWith(']')) {
      throw new FaroError('FRONT_MATTER_SYNTAX', `${source} line ${lineNumber} has an unterminated inline list.`, {
        hint: 'Inline lists must close on the same line, for example: [OBJ-01, OBJ-02].',
        path: source,
      });
    }
    const inner = token.slice(1, -1).trim();
    if (inner === '') return [];
    return splitInline(inner).map((part) => parseScalar(part.trim(), lineNumber, source));
  }
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null' || token === '~') return null;
  if (/^-?\d+$/.test(token)) return Number.parseInt(token, 10);
  if (/^-?\d*\.\d+$/.test(token)) return Number.parseFloat(token);
  return token;
}

function splitInline(text) {
  const parts = [];
  let current = '';
  let quote = null;
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/** Locate the ": " that separates a key from its value, ignoring quoted text. */
function findKeySeparator(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ':' && (i === text.length - 1 || text[i + 1] === ' ')) return i;
  }
  return -1;
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || text[i - 1] === ' ')) return text.slice(0, i).trimEnd();
  }
  return text.trimEnd();
}

function indentOf(line) {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

function skipBlank(lines, start) {
  let index = start;
  while (index < lines.length) {
    const content = stripComment(lines[index].raw).trim();
    if (content !== '') break;
    index += 1;
  }
  return index;
}

/**
 * Serialise a plain object back into the supported YAML subset.
 * Key order is preserved, so callers control the on-disk field order.
 * @param {Record<string, any>} data
 * @param {number} [indent]
 * @returns {string}
 */
export function stringifyYaml(data, indent = 0) {
  let out = '';
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    out += renderEntry(key, value, indent);
  }
  return out;
}

function renderEntry(key, value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${key}: []\n`;
    if (value.every((item) => isScalar(item))) {
      const inline = value.map((item) => renderScalar(item));
      const oneLine = `${pad}${key}: [${inline.join(', ')}]`;
      if (oneLine.length <= 100 && !inline.some((item) => item.includes('\n'))) return `${oneLine}\n`;
      return `${pad}${key}:\n${value.map((item) => `${pad}  - ${renderScalar(item)}\n`).join('')}`;
    }
    let out = `${pad}${key}:\n`;
    for (const item of value) {
      const rendered = stringifyYaml(item, indent + 4);
      out += `${pad}  -${rendered.slice(indent + 3)}`;
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const nested = stringifyYaml(value, indent + INDENT);
    return nested === '' ? `${pad}${key}: {}\n`.replace(': {}', ':\n') : `${pad}${key}:\n${nested}`;
  }
  if (typeof value === 'string' && value.includes('\n')) {
    const block = value
      .split('\n')
      .map((line) => (line === '' ? '' : `${pad}  ${line}`))
      .join('\n');
    return `${pad}${key}: |\n${block}\n`;
  }
  return `${pad}${key}: ${renderScalar(value)}\n`;
}

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function renderScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  const needsQuotes =
    text === '' ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
    /:\s/.test(text) ||
    / #/.test(text) ||
    text !== text.trim() ||
    ['true', 'false', 'null', '~'].includes(text) ||
    /^-?\d+(\.\d+)?$/.test(text);
  if (!needsQuotes) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}
