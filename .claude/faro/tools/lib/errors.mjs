/**
 * Faro error type.
 *
 * Every failure surfaced to a user carries a stable machine code and an
 * actionable message. Stack traces are never printed unless FARO_DEBUG=1.
 */
export class FaroError extends Error {
  /**
   * @param {string} code stable, screaming-snake machine code
   * @param {string} message what went wrong, in one sentence
   * @param {{ hint?: string, path?: string }} [details] how to fix it
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FaroError';
    this.code = code;
    this.hint = details.hint;
    this.path = details.path;
  }
}

/** @param {unknown} err */
export function isFaroError(err) {
  return err instanceof FaroError;
}
