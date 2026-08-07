/// The contract every way of obtaining a location is reached through.
library;

import 'package:family_beacon/core/location/location_snapshot.dart';
import 'package:family_beacon/core/result/result.dart';

/// Supplies device locations.
///
/// Declared here, in pure Dart, so nothing above it knows which plugin is in
/// use. Replacing the adapter is a change in one file in the application layer,
/// and the architecture check proves no domain code has quietly reached past
/// this contract to the plugin underneath.
///
/// Every operation returns a [Result] rather than throwing. A refused
/// permission and a device that cannot get a fix are ordinary, expected
/// outcomes here, not exceptional ones.
abstract interface class LocationSource {
  /// Reads the current location once.
  Future<Result<LocationSnapshot>> currentLocation();

  /// Emits locations as the device reports them.
  ///
  /// A failure ends the stream with an error rather than emitting a broken
  /// reading, so a caller can never mistake a problem for a position.
  Stream<LocationSnapshot> watchLocation();
}
