import { HttpsError, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Who is making a request, once the backend has decided it believes them.
 *
 * Produced only by {@link requireAuthenticated}, so a handler cannot obtain one
 * without the check having run.
 */
export interface Caller {
  readonly uid: string;
}

/**
 * The part of a callable request the authorization check looks at.
 *
 * Narrower than the full request on purpose: the check needs the identity and
 * nothing else, and saying so makes it callable from a test without
 * constructing an entire request.
 */
export interface AuthenticatableRequest {
  readonly auth?: CallableRequest['auth'] | undefined;
}

/**
 * Establishes who is calling, or refuses the request.
 *
 * Authentication proves identity. It does not by itself grant access to a
 * family's data — that is a separate decision, taken per request, against the
 * membership the caller actually holds.
 */
export function requireAuthenticated(request: AuthenticatableRequest): Caller {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'This operation requires a signed-in caller.');
  }

  return { uid };
}

/**
 * Whether this process is the local emulator rather than a deployed function.
 *
 * The emulator sets this itself; nothing in the repository can fake it into a
 * deployed environment.
 */
export function isEmulated(): boolean {
  return process.env['FUNCTIONS_EMULATOR'] === 'true';
}

/**
 * The options every callable in this codebase is declared with.
 *
 * Application attestation is enforced everywhere except the emulator. That is
 * what lets local and automated testing work without weakening what production
 * enforces: the exemption is tied to the emulator's own environment, not to a
 * flag someone could set on a deployed build.
 */
export function callableOptions(overrides: Partial<CallableOptions> = {}): CallableOptions {
  return {
    enforceAppCheck: !isEmulated(),
    ...overrides,
  };
}
