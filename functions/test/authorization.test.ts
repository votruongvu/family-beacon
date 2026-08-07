import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { HttpsError } from 'firebase-functions/v2/https';

import { callableOptions, isEmulated, requireAuthenticated } from '../src/authorization.js';

describe('requireAuthenticated', () => {
  it('establishes the caller when the request carries an identity', () => {
    const caller = requireAuthenticated({ auth: { uid: 'user-1', token: {} } as never });

    assert.equal(caller.uid, 'user-1');
  });

  it('refuses a request with no identity', () => {
    assert.throws(
      () => requireAuthenticated({ auth: undefined }),
      (error: unknown) => error instanceof HttpsError && error.code === 'unauthenticated',
    );
  });

  it('refuses an identity with an empty identifier rather than trusting it', () => {
    assert.throws(
      () => requireAuthenticated({ auth: { uid: '', token: {} } as never }),
      (error: unknown) => error instanceof HttpsError && error.code === 'unauthenticated',
    );
  });

  it('discloses nothing about why in its message', () => {
    assert.throws(
      () => requireAuthenticated({ auth: undefined }),
      (error: unknown) =>
        error instanceof HttpsError && /requires a signed-in caller/.test(error.message),
    );
  });
});

describe('callableOptions', () => {
  const original = process.env['FUNCTIONS_EMULATOR'];

  after(() => {
    if (original === undefined) {
      delete process.env['FUNCTIONS_EMULATOR'];
    } else {
      process.env['FUNCTIONS_EMULATOR'] = original;
    }
  });

  it('enforces attestation when deployed', () => {
    delete process.env['FUNCTIONS_EMULATOR'];

    assert.equal(isEmulated(), false);
    assert.equal(callableOptions().enforceAppCheck, true);
  });

  it('relaxes attestation only inside the emulator', () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';

    assert.equal(isEmulated(), true);
    assert.equal(callableOptions().enforceAppCheck, false);
  });

  it('treats any other value as deployed, so the exemption cannot be faked', () => {
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      process.env['FUNCTIONS_EMULATOR'] = value;

      assert.equal(callableOptions().enforceAppCheck, true, `value ${JSON.stringify(value)}`);
    }
  });

  it('lets a caller add options without losing the attestation default', () => {
    delete process.env['FUNCTIONS_EMULATOR'];

    const options = callableOptions({ region: 'asia-southeast1' });

    assert.equal(options.enforceAppCheck, true);
    assert.equal(options.region, 'asia-southeast1');
  });
});

describe('the deployed surface', () => {
  let exported: Record<string, unknown>;

  before(async () => {
    exported = (await import('../src/index.js')) as Record<string, unknown>;
  });

  it('exposes only the infrastructure probes, and no product operation', () => {
    const names = Object.keys(exported).sort();

    assert.deepEqual(names, ['authenticatedPing', 'health']);
  });
});
