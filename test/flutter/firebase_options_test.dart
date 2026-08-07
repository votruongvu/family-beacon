import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('each environment resolves to its own backend project', () {
    final projectIds = <String>{
      for (final environment in AppEnvironment.values)
        firebaseOptionsFor(environment).projectId,
    };

    expect(
      projectIds,
      hasLength(AppEnvironment.values.length),
      reason: 'two environments sharing a project would break isolation',
    );
  });

  test('the resolved project matches what the environment declares', () {
    for (final environment in AppEnvironment.values) {
      expect(
        firebaseOptionsFor(environment).projectId,
        environment.firebaseProjectId,
      );
    }
  });

  test('each environment resolves to its own application', () {
    final appIds = <String>{
      for (final environment in AppEnvironment.values)
        firebaseOptionsFor(environment).appId,
    };

    expect(appIds, hasLength(AppEnvironment.values.length));
  });

  test('the configuration holds no server credential', () {
    for (final environment in AppEnvironment.values) {
      final options = firebaseOptionsFor(environment);

      // Client configuration is public by design — it identifies the project,
      // it does not authorize access to it. What must never appear here is a
      // server key or a service-account credential, and those are recognisable.
      expect(options.asMap.keys, isNot(contains('privateKey')));
      expect(options.asMap.keys, isNot(contains('clientEmail')));
    }
  });

  test('the placeholder keys are shaped the way the platform demands', () {
    // The iOS SDK validates the shape of the key before it makes any request:
    // 39 characters, starting with `A`. A placeholder that ignores this makes
    // the application crash on launch rather than fail on first use, which is
    // how this was found.
    for (final environment in AppEnvironment.values) {
      final apiKey = firebaseOptionsFor(environment).apiKey;

      expect(
        apiKey,
        hasLength(39),
        reason: 'the platform rejects any other length',
      );
      expect(
        apiKey,
        startsWith('A'),
        reason: 'the platform rejects any other prefix',
      );
      expect(
        apiKey,
        contains('Placeholder'),
        reason: 'these must stay obviously fake until real projects exist',
      );
    }
  });
}
