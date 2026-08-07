// The proof that the architecture works end to end.
//
// Everything else about the baseline is verified in isolation: the rules
// against the emulator, the callables against the emulator, the domain against
// nothing at all. This is the one test that runs the whole path on a real
// device — interface, provider, use case, domain contract, data implementation,
// mapper, datastore — and checks what comes back.
//
// It needs the emulator suite running. See the setup documentation.
//
//   flutter test integration_test/backend_round_trip_test.dart \
//     -d <device> --flavor development --dart-define=APP_ENV=development

import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options.dart';
import 'package:family_beacon/core/time/clock.dart';
import 'package:family_beacon/features/diagnostics/data/repositories/firestore_backend_probe_repository.dart';
import 'package:family_beacon/features/diagnostics/domain/repositories/backend_probe_repository.dart';
import 'package:family_beacon/features/diagnostics/domain/usecases/record_backend_probe.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Where the emulator suite is, as seen from the device running this test.
///
/// An Android emulator reaches the developer's machine through a dedicated
/// address; an iOS simulator shares the host's loopback.
String get emulatorHost => Platform.isAndroid ? '10.0.2.2' : '127.0.0.1';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late BackendProbeRepository repository;
  late String signedInUserId;

  setUpAll(() async {
    final config = AppConfig.forEnvironment(
      AppEnvironment.development,
      emulatorHost: emulatorHost,
    );

    expect(
      config.useEmulators,
      isTrue,
      reason: 'this test must never be able to reach a real project',
    );

    await Firebase.initializeApp(
      options: firebaseOptionsFor(config.environment),
    );

    FirebaseFirestore.instance.useFirestoreEmulator(
      config.emulators.host,
      config.emulators.firestorePort,
    );
    await FirebaseAuth.instance.useAuthEmulator(
      config.emulators.host,
      config.emulators.authPort,
    );

    // The rules scope a probe to its owner, so the round trip only works for
    // someone the backend has actually authenticated.
    final credential = await FirebaseAuth.instance.signInAnonymously();
    signedInUserId = credential.user!.uid;

    repository = FirestoreBackendProbeRepository(FirebaseFirestore.instance);
  });

  tearDownAll(() async {
    await FirebaseAuth.instance.signOut();
  });

  testWidgets('a probe survives the whole round trip', (tester) async {
    final clock = FixedClock(DateTime.utc(2026, 8, 7, 12, 30));
    final recordProbe = RecordBackendProbe(
      repository: repository,
      clock: clock,
    );

    final written = await recordProbe(
      ownerId: signedInUserId,
      note: 'round trip',
    );
    expect(
      written.isOk,
      isTrue,
      reason: 'writing failed: ${written.failureOrNull}',
    );

    final readBack = await repository.latestFor(signedInUserId);
    expect(
      readBack.isOk,
      isTrue,
      reason: 'reading failed: ${readBack.failureOrNull}',
    );

    final probe = readBack.valueOrNull;
    expect(probe, isNotNull);
    expect(probe!.ownerId, signedInUserId);
    expect(probe.note, 'round trip');
    expect(
      probe.recordedAt,
      DateTime.utc(2026, 8, 7, 12, 30),
      reason: 'the timestamp must survive the mapping in both directions',
    );
  });

  testWidgets('reading someone else is refused by the backend', (tester) async {
    // The client is perfectly willing to ask. The rules are what stop it, which
    // is the only place that stopping it means anything.
    final result = await repository.latestFor('somebody-else-entirely');

    expect(result.isOk, isFalse);
    expect(
      result.failureOrNull?.code,
      'not_authorized',
      reason:
          'a refusal must arrive as an authorization failure, not as a crash',
    );
  });

  testWidgets('an absent probe is an answer rather than a failure', (
    tester,
  ) async {
    // Signing in anonymously while already signed in returns the *same* person,
    // not a new one — so without signing out first this would read back the
    // probe the round-trip test just wrote and prove nothing.
    await FirebaseAuth.instance.signOut();
    final credential = await FirebaseAuth.instance.signInAnonymously();
    final freshUserId = credential.user!.uid;
    expect(freshUserId, isNot(signedInUserId));

    final result = await FirestoreBackendProbeRepository(
      FirebaseFirestore.instance,
    ).latestFor(freshUserId);

    expect(result.isOk, isTrue);
    expect(result.valueOrNull, isNull);
  });
}
