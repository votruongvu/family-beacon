/**
 * Minimal declarative validator.
 *
 * Faro's canonical shapes are small and fixed, so a ~120-line validator is
 * cheaper than a dependency and keeps the kit installable by copying a folder.
 * Every failure is reported as a path + message so `faro verify` can point a
 * human straight at the offending field.
 */

/** @typedef {{ path: string, message: string }} Issue */

/**
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {string} [path]
 * @returns {Issue[]}
 */
export function validate(value, schema, path = '') {
  const issues = [];
  check(value, schema, path || '(root)', issues);
  return issues;
}

function check(value, schema, path, issues) {
  if (value === undefined || value === null) {
    if (schema.nullable) return;
    issues.push({ path, message: 'is required but missing' });
    return;
  }
  switch (schema.type) {
    case 'string':
      checkString(value, schema, path, issues);
      return;
    case 'integer':
      if (!Number.isInteger(value)) {
        issues.push({ path, message: `must be an integer, received ${describe(value)}` });
        return;
      }
      if (schema.min !== undefined && value < schema.min) {
        issues.push({ path, message: `must be at least ${schema.min}` });
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ path, message: `must be true or false, received ${describe(value)}` });
      return;
    case 'array':
      checkArray(value, schema, path, issues);
      return;
    case 'object':
      checkObject(value, schema, path, issues);
      return;
    case 'any':
      return;
    default:
      issues.push({ path, message: `has no validator for type "${schema.type}"` });
  }
}

function checkString(value, schema, path, issues) {
  if (typeof value !== 'string') {
    issues.push({ path, message: `must be a string, received ${describe(value)}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, message: `must be one of ${schema.enum.join(' | ')}, received "${value}"` });
    return;
  }
  if (schema.pattern && !schema.pattern.test(value)) {
    issues.push({ path, message: `must match ${schema.pattern} — received "${value}"` });
    return;
  }
  if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
    issues.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
  }
}

function checkArray(value, schema, path, issues) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `must be a list, received ${describe(value)}` });
    return;
  }
  if (schema.min !== undefined && value.length < schema.min) {
    issues.push({ path, message: `must contain at least ${schema.min} entr${schema.min === 1 ? 'y' : 'ies'}` });
  }
  value.forEach((item, index) => check(item, schema.of, `${path}[${index}]`, issues));
}

function checkObject(value, schema, path, issues) {
  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ path, message: `must be a mapping, received ${describe(value)}` });
    return;
  }
  const fields = schema.fields ?? {};
  const required = new Set(schema.required ?? []);
  for (const [key, fieldSchema] of Object.entries(fields)) {
    const child = value[key];
    const childPath = path === '(root)' ? key : `${path}.${key}`;
    if (child === undefined || child === null) {
      if (required.has(key)) issues.push({ path: childPath, message: 'is required but missing' });
      continue;
    }
    check(child, fieldSchema, childPath, issues);
  }
  if (!schema.allowUnknown) {
    for (const key of Object.keys(value)) {
      if (!(key in fields)) {
        const childPath = path === '(root)' ? key : `${path}.${key}`;
        issues.push({ path: childPath, message: 'is not a recognised field' });
      }
    }
  }
}

function describe(value) {
  if (Array.isArray(value)) return 'a list';
  if (value === null) return 'null';
  if (typeof value === 'object') return 'a mapping';
  return `${typeof value} "${value}"`;
}

/** Convenience builders — they only exist to keep model.mjs readable. */
export const s = {
  /** @param {Record<string, any>} [opts] */
  string: (opts = {}) => ({ type: 'string', minLength: 1, ...opts }),
  enum: (values, opts = {}) => ({ type: 'string', enum: values, ...opts }),
  integer: (opts = {}) => ({ type: 'integer', ...opts }),
  boolean: (opts = {}) => ({ type: 'boolean', ...opts }),
  list: (of, opts = {}) => ({ type: 'array', of, ...opts }),
  object: (fields, required = [], opts = {}) => ({ type: 'object', fields, required, ...opts }),
  any: () => ({ type: 'any' }),
};
