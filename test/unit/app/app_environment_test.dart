@TestOn('vm')
library;

import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:test/test.dart';

void main() {
  test('each environment points at its own backend project', () {
    final projects = AppEnvironment.values
        .map((environment) => environment.firebaseProjectId)
        .toSet();

    expect(projects, hasLength(AppEnvironment.values.length));
    expect(AppEnvironment.development.firebaseProjectId, 'family-beacon-dev');
    expect(AppEnvironment.staging.firebaseProjectId, 'family-beacon-stg');
    expect(AppEnvironment.production.firebaseProjectId, 'family-beacon-prod');
  });

  test('each environment installs under its own identifier', () {
    final suffixes = AppEnvironment.values
        .map((environment) => environment.applicationIdSuffix)
        .toSet();

    expect(suffixes, hasLength(AppEnvironment.values.length));
    expect(AppEnvironment.production.applicationIdSuffix, isEmpty);
  });

  test('production carries no decoration on its name or identifier', () {
    expect(AppEnvironment.production.displaySuffix, isEmpty);
    expect(AppEnvironment.production.isProduction, isTrue);
    expect(AppEnvironment.development.isProduction, isFalse);
    expect(AppEnvironment.staging.isProduction, isFalse);
  });

  group('parse', () {
    test('resolves every known name', () {
      for (final environment in AppEnvironment.values) {
        expect(AppEnvironment.parse(environment.id), environment);
      }
    });

    test('refuses an unknown name rather than guessing', () {
      expect(() => AppEnvironment.parse('prod'), throwsArgumentError);
      expect(() => AppEnvironment.parse(''), throwsArgumentError);
      expect(() => AppEnvironment.parse('Production'), throwsArgumentError);
    });

    test('names the valid options when it refuses', () {
      expect(
        () => AppEnvironment.parse('prod'),
        throwsA(
          isA<ArgumentError>().having(
            (error) => error.message,
            'message',
            allOf(
              contains('development'),
              contains('staging'),
              contains('production'),
            ),
          ),
        ),
      );
    });
  });

  test('a build that says nothing gets development, never production', () {
    expect(AppEnvironment.current(), AppEnvironment.development);
  });
}
