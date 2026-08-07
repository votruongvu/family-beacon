@TestOn('vm')
library;

import 'package:family_beacon/core/location/location_snapshot.dart';
import 'package:test/test.dart';

LocationSnapshot snapshot({
  double latitude = 10.7769,
  double longitude = 106.7009,
  double accuracyMeters = 12,
  DateTime? capturedAt,
  DateTime? receivedAt,
}) => LocationSnapshot(
  latitude: latitude,
  longitude: longitude,
  accuracyMeters: accuracyMeters,
  capturedAt: capturedAt ?? DateTime.utc(2026, 8, 7, 12),
  receivedAt: receivedAt ?? DateTime.utc(2026, 8, 7, 12),
);

void main() {
  group('what a reading must carry', () {
    test('keeps both timestamps, because they answer different questions', () {
      final reading = snapshot(
        capturedAt: DateTime.utc(2026, 8, 7, 12),
        receivedAt: DateTime.utc(2026, 8, 7, 12, 40),
      );

      expect(reading.capturedAt, DateTime.utc(2026, 8, 7, 12));
      expect(reading.receivedAt, DateTime.utc(2026, 8, 7, 12, 40));
      expect(reading.deliveryDelay, const Duration(minutes: 40));
    });

    test('normalises both timestamps to UTC', () {
      final reading = snapshot(
        capturedAt: DateTime(2026, 8, 7, 12),
        receivedAt: DateTime(2026, 8, 7, 12),
      );

      expect(reading.capturedAt.isUtc, isTrue);
      expect(reading.receivedAt.isUtc, isTrue);
    });

    test('keeps the accuracy, so a reading is never presented as a point', () {
      expect(snapshot(accuracyMeters: 65).accuracyMeters, 65);
      expect(snapshot(accuracyMeters: 0).accuracyMeters, 0);
    });
  });

  group('age', () {
    test('is measured from when the device was there, not when we heard', () {
      final reading = snapshot(
        capturedAt: DateTime.utc(2026, 8, 7, 12),
        receivedAt: DateTime.utc(2026, 8, 7, 12, 55),
      );

      expect(
        reading.ageAt(DateTime.utc(2026, 8, 7, 13)),
        const Duration(hours: 1),
        reason:
            'measuring from receipt would make a stale reading look fresh on arrival',
      );
    });

    test('handles a clock in another time zone', () {
      final reading = snapshot(capturedAt: DateTime.utc(2026, 8, 7, 12));

      expect(
        reading.ageAt(DateTime.utc(2026, 8, 7, 12, 30).toLocal()),
        const Duration(minutes: 30),
      );
    });
  });

  group('refusing a reading that cannot be true', () {
    test('rejects a latitude off the planet', () {
      expect(() => snapshot(latitude: 90.1), throwsArgumentError);
      expect(() => snapshot(latitude: -90.1), throwsArgumentError);
      expect(() => snapshot(latitude: double.nan), throwsArgumentError);
    });

    test('rejects a longitude off the planet', () {
      expect(() => snapshot(longitude: 180.1), throwsArgumentError);
      expect(() => snapshot(longitude: -180.1), throwsArgumentError);
      expect(() => snapshot(longitude: double.nan), throwsArgumentError);
    });

    test('rejects a negative accuracy', () {
      expect(() => snapshot(accuracyMeters: -1), throwsArgumentError);
      expect(() => snapshot(accuracyMeters: double.nan), throwsArgumentError);
    });

    test('accepts the extremes, which are real places', () {
      expect(() => snapshot(latitude: 90, longitude: 180), returnsNormally);
      expect(() => snapshot(latitude: -90, longitude: -180), returnsNormally);
    });
  });

  test('its description carries no coordinate', () {
    // A reading reaching a log or a crash report must not take someone's
    // position with it.
    final description = snapshot(
      latitude: 10.7769,
      longitude: 106.7009,
    ).toString();

    expect(description, isNot(contains('10.77')));
    expect(description, isNot(contains('106.7')));
    expect(description, contains('capturedAt'));
  });
}
