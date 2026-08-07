// Callable tests, run against the Functions emulator.
//
// The unit tests inside `functions/` prove the authorization helper in
// isolation. These prove the whole path: a client calls a deployed handler, the
// emulator runs the real compiled code, and the refusal an anonymous caller
// gets is the one the helper produces.
//
// Run with:  npm run test:callables

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'family-beacon-test';

let app;
let functions;

before(() => {
  app = initializeApp({
    apiKey: 'APlaceholderKey-emulator-tests-00000000',
    appId: '1:000000000000:web:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: PROJECT_ID,
  });

  functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
});

after(async () => {
  await deleteApp(app);
});

describe('health', () => {
  it('answers, which is the whole point of it', async () => {
    const { data } = await httpsCallable(functions, 'health')();

    assert.equal(data.status, 'ok');
  });

  it('reports a server time rather than trusting the caller for one', async () => {
    const { data } = await httpsCallable(functions, 'health')();
    const serverTime = new Date(data.serverTime);

    assert.ok(!Number.isNaN(serverTime.getTime()), 'serverTime must parse');
    assert.ok(
      Math.abs(Date.now() - serverTime.getTime()) < 60_000,
      'serverTime should be close to now',
    );
  });
});

describe('authenticatedPing', () => {
  it('refuses an anonymous caller', async () => {
    await assert.rejects(
      httpsCallable(functions, 'authenticatedPing')(),
      (error) => {
        assert.equal(error.code, 'functions/unauthenticated');
        return true;
      },
      'an unauthenticated caller must be refused by the backend, not by the client',
    );
  });
});

describe('the deployed surface', () => {
  it('has no product operation reachable yet', async () => {
    // A capability that does not exist must answer "not found" rather than
    // anything that could be mistaken for a partial implementation.
    await assert.rejects(
      httpsCallable(functions, 'activateSos')(),
      (error) => {
        assert.equal(error.code, 'functions/not-found');
        return true;
      },
    );
  });
});
