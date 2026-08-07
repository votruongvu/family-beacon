/// Time, as something the application asks for rather than reads directly.
library;

/// Supplies the current time.
///
/// Nothing in the domain calls `DateTime.now()`. Location freshness, assistance
/// expiry, and invitation expiry are all decided by comparing timestamps, and
/// those decisions have to be testable without waiting for real time to pass.
abstract interface class Clock {
  /// The current moment, always in UTC.
  ///
  /// Timestamps are compared across devices in different time zones, so the
  /// application has one representation and converts only for display.
  DateTime nowUtc();
}

/// A clock backed by the device.
final class SystemClock implements Clock {
  /// Creates a clock backed by the device.
  const SystemClock();

  @override
  DateTime nowUtc() => DateTime.now().toUtc();
}

/// A clock that stays where it is put.
final class FixedClock implements Clock {
  /// Creates a clock reading [instant].
  FixedClock(DateTime instant) : _instant = instant.toUtc();

  DateTime _instant;

  /// Moves the clock forward by [duration].
  void advance(Duration duration) => _instant = _instant.add(duration);

  /// Moves the clock to [instant].
  void set(DateTime instant) => _instant = instant.toUtc();

  @override
  DateTime nowUtc() => _instant;
}
