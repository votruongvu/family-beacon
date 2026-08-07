@TestOn('vm')
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/core/time/clock.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:family_beacon/features/diagnostics/domain/repositories/backend_probe_repository.dart';
import 'package:family_beacon/features/diagnostics/domain/usecases/record_backend_probe.dart';
import 'package:test/test.dart';

/// An implementation of the contract that never leaves this file.
///
/// This is the whole argument for the dependency direction: the use case below
/// is exercised completely, with no datastore, no emulator, and no framework
/// binding, because it only ever knew a contract.
final class _InMemoryProbeRepository implements BackendProbeRepository {
  final Map<String, BackendProbe> _stored = <String, BackendProbe>{};
  Failure? failure;
  int recordCalls = 0;

  @override
  Future<Result<BackendProbe>> record(BackendProbe probe) async {
    recordCalls++;
    final current = failure;
    if (current != null) {
      return Err<BackendProbe>(current);
    }
    _stored[probe.ownerId] = probe;
    return Ok<BackendProbe>(probe);
  }

  @override
  Future<Result<BackendProbe?>> latestFor(String ownerId) async {
    final current = failure;
    if (current != null) {
      return Err<BackendProbe?>(current);
    }
    return Ok<BackendProbe?>(_stored[ownerId]);
  }
}

void main() {
  group('BackendProbe', () {
    test('normalises its timestamp to UTC', () {
      final probe = BackendProbe(
        ownerId: 'user-1',
        recordedAt: DateTime(2026, 8, 7, 12),
        note: 'probe',
      );

      expect(probe.recordedAt.isUtc, isTrue);
    });

    test('refuses to exist without an owner', () {
      expect(
        () => BackendProbe(
          ownerId: '',
          recordedAt: DateTime.utc(2026),
          note: 'probe',
        ),
        throwsArgumentError,
      );
    });

    test('refuses a note longer than it is willing to store', () {
      expect(
        () => BackendProbe(
          ownerId: 'user-1',
          recordedAt: DateTime.utc(2026),
          note: 'x' * (BackendProbe.maximumNoteLength + 1),
        ),
        throwsArgumentError,
      );
    });

    test('accepts a note exactly at the limit', () {
      expect(
        () => BackendProbe(
          ownerId: 'user-1',
          recordedAt: DateTime.utc(2026),
          note: 'x' * BackendProbe.maximumNoteLength,
        ),
        returnsNormally,
      );
    });

    test('compares by value', () {
      BackendProbe make() => BackendProbe(
        ownerId: 'user-1',
        recordedAt: DateTime.utc(2026),
        note: 'probe',
      );

      expect(make(), make());
      expect(make().hashCode, make().hashCode);
    });
  });

  group('RecordBackendProbe', () {
    late _InMemoryProbeRepository repository;
    late FixedClock clock;
    late RecordBackendProbe recordProbe;

    setUp(() {
      repository = _InMemoryProbeRepository();
      clock = FixedClock(DateTime.utc(2026, 8, 7, 12));
      recordProbe = RecordBackendProbe(repository: repository, clock: clock);
    });

    test(
      'records the time from the application clock, not from the caller',
      () async {
        final result = await recordProbe(ownerId: 'user-1');

        expect(result.valueOrNull?.recordedAt, DateTime.utc(2026, 8, 7, 12));
      },
    );

    test('a later call records a later time', () async {
      final first = await recordProbe(ownerId: 'user-1');
      clock.advance(const Duration(minutes: 5));
      final second = await recordProbe(ownerId: 'user-1');

      expect(
        second.valueOrNull!.recordedAt.isAfter(first.valueOrNull!.recordedAt),
        isTrue,
      );
    });

    test('what was written can be read back', () async {
      await recordProbe(ownerId: 'user-1', note: 'hello');

      final stored = await repository.latestFor('user-1');

      expect(stored.valueOrNull?.note, 'hello');
    });

    test('reading someone with no probe is an answer, not a failure', () async {
      final stored = await repository.latestFor('nobody');

      expect(stored.isOk, isTrue);
      expect(stored.valueOrNull, isNull);
    });

    test('a refusal comes back as a failure the caller can act on', () async {
      repository.failure = const AuthorizationFailure();

      final result = await recordProbe(ownerId: 'user-1');

      expect(result.isOk, isFalse);
      expect(result.failureOrNull, isA<AuthorizationFailure>());
    });

    test('a refusal does not silently retry', () async {
      repository.failure = const AuthorizationFailure();

      await recordProbe(ownerId: 'user-1');

      expect(repository.recordCalls, 1);
    });
  });
}
