/// One reading of where a device was.
library;

/// A location, with everything needed to say how much to trust it.
///
/// The two timestamps are both kept, and both matter. [capturedAt] is when the
/// device decided this was its position; [receivedAt] is when the system was
/// told. A large gap between them means a reading sat in a queue on a phone
/// with no signal, which is exactly the situation where showing it as current
/// would be a lie.
///
/// The Charter is explicit that the product never presents an old location as a
/// current one. This type is where that starts: it is impossible to construct a
/// reading that has forgotten when it was taken.
final class LocationSnapshot {
  /// Creates a reading.
  ///
  /// Throws if the coordinates are not on Earth or the accuracy is negative.
  /// A malformed reading is a bug in an adapter, and surfacing it here is far
  /// better than storing nonsense and drawing it on a map.
  LocationSnapshot({
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required DateTime capturedAt,
    required DateTime receivedAt,
  }) : capturedAt = capturedAt.toUtc(),
       receivedAt = receivedAt.toUtc() {
    if (latitude < -90 || latitude > 90 || latitude.isNaN) {
      throw ArgumentError.value(
        latitude,
        'latitude',
        'must be between -90 and 90',
      );
    }
    if (longitude < -180 || longitude > 180 || longitude.isNaN) {
      throw ArgumentError.value(
        longitude,
        'longitude',
        'must be between -180 and 180',
      );
    }
    if (accuracyMeters < 0 || accuracyMeters.isNaN) {
      throw ArgumentError.value(
        accuracyMeters,
        'accuracyMeters',
        'must not be negative',
      );
    }
  }

  /// Degrees north of the equator.
  final double latitude;

  /// Degrees east of the prime meridian.
  final double longitude;

  /// The radius the device believes the true position lies within.
  ///
  /// A reading is not a point. Presenting one without its accuracy invites a
  /// family to walk to a spot that was never claimed.
  final double accuracyMeters;

  /// When the device took the reading, in UTC.
  final DateTime capturedAt;

  /// When the system was told about it, in UTC.
  final DateTime receivedAt;

  /// How old the reading is at [now].
  ///
  /// Measured from [capturedAt], because that is when the person was actually
  /// there. Measuring from [receivedAt] would make a stale reading look fresh
  /// the moment it arrived.
  Duration ageAt(DateTime now) => now.toUtc().difference(capturedAt);

  /// How long the reading waited before the system heard about it.
  ///
  /// Large values mean a connectivity problem rather than a location problem,
  /// and the two deserve different words in the interface.
  Duration get deliveryDelay => receivedAt.difference(capturedAt);

  @override
  String toString() =>
      'LocationSnapshot(capturedAt: $capturedAt, accuracy: ${accuracyMeters}m)';
}
