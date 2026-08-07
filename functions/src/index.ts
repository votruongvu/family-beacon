import { onCall } from 'firebase-functions/v2/https';

import { callableOptions, requireAuthenticated } from './authorization.js';

/**
 * Trusted backend code for Family Beacon.
 *
 * The two callables below are infrastructure probes, not product capabilities.
 * They exist so the Foundation can demonstrate that the callable path works
 * end to end — client, emulator, deployment — and that the shared authorization
 * helper refuses an anonymous caller.
 *
 * Product operations arrive as Requirements. Anything with cross-user effect or
 * elevated trust belongs here rather than on the client: creating a family,
 * accepting an invitation, activating an assistance request, and above all
 * dispatching notifications, which the client must never do directly.
 */

/**
 * Reports that the backend is reachable.
 *
 * Open by design: it is how a developer and a health check confirm the
 * deployment answers at all, and it discloses nothing.
 */
export const health = onCall(callableOptions(), () => {
  return {
    status: 'ok',
    serverTime: new Date().toISOString(),
  };
});

/**
 * Reports the caller back to themselves.
 *
 * The smallest thing that proves authentication reaches a handler: it returns
 * the caller's own identifier and nothing about anyone else.
 */
export const authenticatedPing = onCall(callableOptions(), (request) => {
  const caller = requireAuthenticated(request);

  return {
    status: 'ok',
    uid: caller.uid,
  };
});
