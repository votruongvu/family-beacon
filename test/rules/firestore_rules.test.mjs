// Security-rules tests.
//
// These run against the Firestore emulator with the real `firestore.rules`
// loaded, so what they prove is what the rules actually do rather than what
// anyone believes they do.
//
// The rules are a security boundary, so the tests are written from the outside:
// every case is "could an attacker do this?", and the expected answer is almost
// always no.
//
// Run with:  npm run test:rules

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'family-beacon-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

describe('the default deny', () => {
  it('refuses an unauthenticated read', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, 'families/family-1')));
  });

  it('refuses an unauthenticated write', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(setDoc(doc(db, 'families/family-1'), { name: 'Nguyen' }));
  });

  it('refuses an authenticated read of a collection nobody has secured', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(getDoc(doc(db, 'families/family-1')));
  });

  it('refuses an authenticated write to a collection nobody has secured', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(setDoc(doc(db, 'families/family-1'), { name: 'Nguyen' }));
  });

  it('refuses a listing, not only a document read', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(getDocs(collection(db, 'families')));
  });

  it('refuses a delete', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(deleteDoc(doc(db, 'families/family-1')));
  });

  it('refuses a path invented on the spot, however deeply nested', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(getDoc(doc(db, 'anything/at/all/nested/deeply/here')));
    await assertFails(setDoc(doc(db, 'anything/at/all/nested/deeply/here'), { x: 1 }));
  });
});

describe('the family boundary', () => {
  // Cross-family access is the failure this product cannot afford, so it is
  // asserted here from the first day — while the answer is "everything is
  // denied" — and the assertion stays as capabilities are added. If a later
  // Requirement ever opens one of these paths too widely, this fails.

  it('refuses one person reading another family data', async () => {
    const db = testEnvironment.authenticatedContext('outsider').firestore();

    await assertFails(getDoc(doc(db, 'families/family-1')));
    await assertFails(getDocs(collection(db, 'families/family-1/memberships')));
    await assertFails(getDoc(doc(db, 'latest_locations/family-1__member-1')));
    await assertFails(getDocs(collection(db, 'sos_events')));
  });

  it('refuses one person writing another person location', async () => {
    const db = testEnvironment.authenticatedContext('outsider').firestore();

    await assertFails(
      setDoc(doc(db, 'latest_locations/family-1__member-1'), {
        latitude: 10.77,
        longitude: 106.7,
      }),
    );
  });

  it('refuses enabling sharing on behalf of someone else', async () => {
    const db = testEnvironment.authenticatedContext('outsider').firestore();

    await assertFails(
      setDoc(doc(db, 'users/member-1'), { locationSharingEnabled: true }),
    );
  });

  it('refuses acknowledging an assistance request as another person', async () => {
    const db = testEnvironment.authenticatedContext('outsider').firestore();

    await assertFails(
      setDoc(doc(db, 'sos_acknowledgements/sos-1__member-1'), {
        userId: 'member-1',
        status: 'RESPONDING',
      }),
    );
  });
});

describe('the diagnostics probe', () => {
  it('lets someone write their own', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertSucceeds(
      setDoc(doc(db, 'diagnostics/user-1'), { recordedAt: new Date(), note: 'probe' }),
    );
  });

  it('lets someone read their own back', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'diagnostics/user-1'), { recordedAt: new Date(), note: 'probe' }),
    );

    await assertSucceeds(getDoc(doc(db, 'diagnostics/user-1')));
  });

  it('refuses reading somebody else', async () => {
    const db = testEnvironment.authenticatedContext('user-2').firestore();

    await assertFails(getDoc(doc(db, 'diagnostics/user-1')));
  });

  it('refuses writing to somebody else', async () => {
    const db = testEnvironment.authenticatedContext('user-2').firestore();

    await assertFails(
      setDoc(doc(db, 'diagnostics/user-1'), { recordedAt: new Date(), note: 'not mine' }),
    );
  });

  it('refuses an anonymous caller entirely', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, 'diagnostics/user-1')));
    await assertFails(
      setDoc(doc(db, 'diagnostics/user-1'), { recordedAt: new Date(), note: 'probe' }),
    );
  });

  it('refuses listing the collection, which would enumerate everyone', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore();

    await assertFails(getDocs(collection(db, 'diagnostics')));
  });
});

describe('the rules file itself', () => {
  it('ends with a catch-all that denies', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const lastMatch = rules.lastIndexOf('match /{document=**}');

    assert.ok(lastMatch > -1, 'there must be a catch-all rule');
    assert.match(
      rules.slice(lastMatch),
      /allow read,\s*write:\s*if false;/,
      'the catch-all must deny, so an unsecured collection is unreachable rather than open',
    );
  });
});
