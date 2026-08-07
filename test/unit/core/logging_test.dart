@TestOn('vm')
library;

import 'package:family_beacon/core/logging/hashed_id.dart';
import 'package:family_beacon/core/logging/log_event.dart';
import 'package:family_beacon/core/logging/logger.dart';
import 'package:test/test.dart';

void main() {
  group('HashedId', () {
    test('never reproduces the identifier it was given', () {
      const raw = 'PDwFqYb0nSXk1vJm';

      expect(HashedId.of(raw).value, isNot(contains(raw)));
      expect(HashedId.of(raw).value, isNot(raw));
    });

    test('is stable, so events can be correlated', () {
      expect(HashedId.of('user-1'), HashedId.of('user-1'));
      expect(HashedId.of('user-1').hashCode, HashedId.of('user-1').hashCode);
    });

    test('separates different identifiers', () {
      expect(HashedId.of('user-1'), isNot(HashedId.of('user-2')));
    });

    test('is a fixed-length hexadecimal token', () {
      expect(HashedId.of('user-1').value, matches(RegExp(r'^[0-9a-f]{16}$')));
      expect(
        HashedId.of('a much longer identifier than the last one').value,
        hasLength(16),
      );
    });
  });

  group('LogEvent', () {
    test('carries only fields chosen in advance', () {
      final event = LogEvent(
        feature: 'location_sharing',
        operation: 'upload_latest_location',
        outcome: LogOutcome.failure,
        level: LogLevel.error,
        errorCode: 'network_unavailable',
        userId: HashedId.of('user-1'),
        familyId: HashedId.of('family-1'),
      );

      expect(event.toFields().keys, <String>[
        'feature',
        'operation',
        'outcome',
        'level',
        'errorCode',
        'userId',
        'familyId',
      ]);
    });

    test('omits what it was not given', () {
      const event = LogEvent(
        feature: 'family_map',
        operation: 'subscribe',
        outcome: LogOutcome.success,
      );

      expect(event.toFields().containsKey('errorCode'), isFalse);
      expect(event.toFields().containsKey('userId'), isFalse);
      expect(event.toFields().containsKey('familyId'), isFalse);
    });

    test('renders identifiers only in hashed form', () {
      final event = LogEvent(
        feature: 'sos',
        operation: 'activate',
        outcome: LogOutcome.denied,
        userId: HashedId.of('+84901234567'),
      );

      expect(event.toString(), isNot(contains('+84901234567')));
      expect(event.toString(), contains(HashedId.of('+84901234567').value));
    });
  });

  group('Logger', () {
    test('the silent logger keeps nothing', () {
      const logger = SilentLogger();

      logger.record(
        const LogEvent(
          feature: 'f',
          operation: 'o',
          outcome: LogOutcome.success,
        ),
      );
      logger.recordFailure(
        const LogEvent(
          feature: 'f',
          operation: 'o',
          outcome: LogOutcome.failure,
        ),
        error: StateError('boom'),
      );
    });

    test('the recording logger keeps events in order', () {
      final logger = RecordingLogger()
        ..record(
          const LogEvent(
            feature: 'f',
            operation: 'first',
            outcome: LogOutcome.success,
          ),
        )
        ..record(
          const LogEvent(
            feature: 'f',
            operation: 'second',
            outcome: LogOutcome.success,
          ),
        );

      expect(logger.events.map((event) => event.operation), <String>[
        'first',
        'second',
      ]);
    });

    test('the recorded list cannot be mutated by a caller', () {
      final logger = RecordingLogger();

      expect(
        () => logger.events.add(
          const LogEvent(
            feature: 'f',
            operation: 'o',
            outcome: LogOutcome.success,
          ),
        ),
        throwsUnsupportedError,
      );
    });
  });
}
