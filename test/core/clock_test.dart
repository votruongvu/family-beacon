@TestOn('vm')
library;

import 'package:family_beacon/core/time/clock.dart';
import 'package:test/test.dart';

void main() {
  test('the system clock reports UTC', () {
    expect(const SystemClock().nowUtc().isUtc, isTrue);
  });

  group('FixedClock', () {
    test('stays where it was put', () {
      final clock = FixedClock(DateTime.utc(2026, 8, 7, 12));

      expect(clock.nowUtc(), DateTime.utc(2026, 8, 7, 12));
      expect(clock.nowUtc(), clock.nowUtc());
    });

    test('converts what it is given to UTC', () {
      final clock = FixedClock(DateTime(2026, 8, 7, 12));

      expect(clock.nowUtc().isUtc, isTrue);
    });

    test('advances on request, so freshness can be tested without waiting', () {
      final clock = FixedClock(DateTime.utc(2026, 8, 7, 12))
        ..advance(const Duration(minutes: 15));

      expect(clock.nowUtc(), DateTime.utc(2026, 8, 7, 12, 15));
    });

    test('can be moved to a chosen instant', () {
      final clock = FixedClock(DateTime.utc(2026, 8, 7))
        ..set(DateTime.utc(2027));

      expect(clock.nowUtc(), DateTime.utc(2027));
    });
  });
}
