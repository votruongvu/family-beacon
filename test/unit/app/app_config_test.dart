@TestOn('vm')
library;

import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:test/test.dart';

void main() {
  group('emulator policy', () {
    test('development uses emulators by default', () {
      expect(
        AppConfig.forEnvironment(AppEnvironment.development).useEmulators,
        isTrue,
      );
    });

    test('staging talks to its real project by default', () {
      expect(
        AppConfig.forEnvironment(AppEnvironment.staging).useEmulators,
        isFalse,
      );
    });

    test('production never uses emulators, whatever the flag says', () {
      expect(
        AppConfig.forEnvironment(
          AppEnvironment.production,
          useEmulatorsOverride: true,
        ).useEmulators,
        isFalse,
        reason:
            'a production build must never be able to talk to a developer machine',
      );
    });

    test('a developer can point development at the real project', () {
      expect(
        AppConfig.forEnvironment(
          AppEnvironment.development,
          useEmulatorsOverride: false,
        ).useEmulators,
        isFalse,
      );
    });

    test('a developer can point staging at emulators', () {
      expect(
        AppConfig.forEnvironment(
          AppEnvironment.staging,
          useEmulatorsOverride: true,
        ).useEmulators,
        isTrue,
      );
    });
  });

  group('emulator endpoints', () {
    test('default to the local machine', () {
      const endpoints = EmulatorEndpoints();

      expect(endpoints.host, 'localhost');
      expect(endpoints.authPort, 9099);
      expect(endpoints.firestorePort, 8080);
      expect(endpoints.functionsPort, 5001);
    });

    test(
      'take the host a build was given, so an Android emulator can reach it',
      () {
        final config = AppConfig.forEnvironment(
          AppEnvironment.development,
          emulatorHost: '10.0.2.2',
        );

        expect(config.emulators.host, '10.0.2.2');
      },
    );
  });

  group('describe', () {
    test('names the environment, the project, and the emulator state', () {
      final description = AppConfig.forEnvironment(
        AppEnvironment.staging,
      ).describe();

      expect(description, contains('environment=staging'));
      expect(description, contains('project=family-beacon-stg'));
      expect(description, contains('emulators=off'));
    });

    test('carries nothing sensitive', () {
      for (final environment in AppEnvironment.values) {
        final description = AppConfig.forEnvironment(environment).describe();

        expect(description, isNot(contains('api-key')));
        expect(description, isNot(contains('placeholder')));
      }
    });
  });

  test('the build configuration defaults to development on emulators', () {
    final config = AppConfig.fromBuild();

    expect(config.environment, AppEnvironment.development);
    expect(config.useEmulators, isTrue);
  });
}
