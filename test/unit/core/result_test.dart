@TestOn('vm')
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/result/result.dart';
import 'package:test/test.dart';

void main() {
  const failure = NetworkUnavailableFailure();

  group('Ok', () {
    test('carries its value and no failure', () {
      const result = Ok<int>(7);

      expect(result.isOk, isTrue);
      expect(result.valueOrNull, 7);
      expect(result.failureOrNull, isNull);
    });

    test('maps the value', () {
      expect(const Ok<int>(7).map((value) => value * 2), const Ok<int>(14));
    });

    test('chains into another operation', () {
      expect(
        const Ok<int>(7).flatMap((value) => Ok<String>('$value')),
        const Ok<String>('7'),
      );
    });

    test('chains into a failure', () {
      expect(
        const Ok<int>(7).flatMap<String>((_) => const Err<String>(failure)),
        const Err<String>(failure),
      );
    });
  });

  group('Err', () {
    test('carries its failure and no value', () {
      const result = Err<int>(failure);

      expect(result.isOk, isFalse);
      expect(result.valueOrNull, isNull);
      expect(result.failureOrNull, failure);
    });

    test('does not run a transform', () {
      var ran = false;
      const Err<int>(failure).map((value) {
        ran = true;
        return value;
      });

      expect(ran, isFalse);
    });

    test('preserves the failure through a map', () {
      expect(
        const Err<int>(failure).map((value) => '$value'),
        const Err<String>(failure),
      );
    });
  });

  group('fold', () {
    test('takes the success branch for Ok', () {
      expect(
        const Ok<int>(7).fold((value) => 'ok $value', (f) => 'err ${f.code}'),
        'ok 7',
      );
    });

    test('takes the failure branch for Err', () {
      expect(
        const Err<int>(
          failure,
        ).fold((value) => 'ok $value', (f) => 'err ${f.code}'),
        'err network_unavailable',
      );
    });
  });

  test('a switch over a result is exhaustive', () {
    String describe(Result<int> result) => switch (result) {
      Ok<int>(:final value) => 'ok $value',
      Err<int>(:final failure) => 'err ${failure.code}',
    };

    expect(describe(const Ok<int>(1)), 'ok 1');
    expect(describe(const Err<int>(failure)), 'err network_unavailable');
  });
}
