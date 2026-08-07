@TestOn('vm')
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/location/in_memory_location_source.dart';
import 'package:family_beacon/core/location/location_snapshot.dart';
import 'package:family_beacon/core/location/location_source.dart';
import 'package:test/test.dart';

LocationSnapshot reading({double accuracyMeters = 12}) => LocationSnapshot(
  latitude: 10.7769,
  longitude: 106.7009,
  accuracyMeters: accuracyMeters,
  capturedAt: DateTime.utc(2026, 8, 7, 12),
  receivedAt: DateTime.utc(2026, 8, 7, 12),
);

/// Stands in for the kind of code a feature will write.
///
/// It knows the contract and nothing else — no plugin, no platform, no
/// permission enum. That is what makes the boundary worth having, and this
/// function is how the tests below prove it.
Future<String> describeCurrentLocation(LocationSource source) async {
  final result = await source.currentLocation();

  return result.fold(
    (snapshot) => 'located within ${snapshot.accuracyMeters.round()}m',
    (failure) => switch (failure) {
      PermissionDeniedFailure(permanentlyDenied: true) =>
        'permission refused in settings',
      PermissionDeniedFailure() => 'permission not granted',
      _ => 'location unavailable',
    },
  );
}

void main() {
  group(
    'the contract is honoured by an implementation that shares nothing with the platform',
    () {
      test('a reading comes back as a value', () async {
        final source = InMemoryLocationSource(
          initial: reading(accuracyMeters: 8),
        );
        addTearDown(source.dispose);

        expect(await describeCurrentLocation(source), 'located within 8m');
      });

      test(
        'a refused permission comes back as a failure, not an exception',
        () async {
          final source = InMemoryLocationSource.permissionDenied();
          addTearDown(source.dispose);

          expect(
            await describeCurrentLocation(source),
            'permission not granted',
          );
        },
      );

      test('a permanently refused permission is distinguishable', () async {
        final source = InMemoryLocationSource.permissionDenied(
          permanently: true,
        );
        addTearDown(source.dispose);

        expect(
          await describeCurrentLocation(source),
          'permission refused in settings',
          reason:
              'asking again would do nothing, so the interface must say something different',
        );
      });

      test('a device that cannot get a fix comes back as a failure', () async {
        final source = InMemoryLocationSource();
        addTearDown(source.dispose);

        expect(await describeCurrentLocation(source), 'location unavailable');
      });

      test(
        'the same caller works against either source without modification',
        () async {
          // The point of the boundary: `describeCurrentLocation` was written once,
          // and swapping what is behind the contract changes nothing about it.
          final source = InMemoryLocationSource(
            initial: reading(accuracyMeters: 40),
          );
          addTearDown(source.dispose);
          expect(await describeCurrentLocation(source), 'located within 40m');

          source.fail(const NetworkUnavailableFailure());
          expect(await describeCurrentLocation(source), 'location unavailable');
        },
      );
    },
  );

  group('watching', () {
    test('emits what it is given', () async {
      final source = InMemoryLocationSource();
      addTearDown(source.dispose);

      final emitted = <double>[];
      final subscription = source.watchLocation().listen(
        (snapshot) => emitted.add(snapshot.accuracyMeters),
      );
      addTearDown(subscription.cancel);

      source
        ..emit(reading(accuracyMeters: 10))
        ..emit(reading(accuracyMeters: 20));
      await Future<void>.delayed(Duration.zero);

      expect(emitted, <double>[10, 20]);
    });

    test('emitting clears a previous failure', () async {
      final source = InMemoryLocationSource.permissionDenied();
      addTearDown(source.dispose);
      expect((await source.currentLocation()).isOk, isFalse);

      source.emit(reading());

      expect((await source.currentLocation()).isOk, isTrue);
    });
  });

  test('a failure carries which permission it was about', () async {
    final source = InMemoryLocationSource.permissionDenied();
    addTearDown(source.dispose);

    final result = await source.currentLocation();
    final failure = result.failureOrNull;

    expect(failure, isA<PermissionDeniedFailure>());
    expect(
      (failure! as PermissionDeniedFailure).permission,
      PermissionKind.locationWhenInUse,
    );
  });
}
