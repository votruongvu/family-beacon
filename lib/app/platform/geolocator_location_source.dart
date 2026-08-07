/// The platform-backed implementation of the location contract.
///
/// This is the only file in the repository that knows the device-location
/// plugin exists. Everything above it speaks [LocationSource], so swapping the
/// plugin is a change here and nowhere else — and the architecture check proves
/// nothing has quietly reached past the contract.
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/location/location_snapshot.dart';
import 'package:family_beacon/core/location/location_source.dart';
import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/core/time/clock.dart';
import 'package:geolocator/geolocator.dart';

/// Reads locations from the device.
final class GeolocatorLocationSource implements LocationSource {
  /// Creates a source backed by the platform, timestamping arrivals with
  /// [clock].
  const GeolocatorLocationSource({this.clock = const SystemClock()});

  /// Stamps when a reading arrived.
  final Clock clock;

  /// How precise a reading to ask the platform for, and how far the device must
  /// move before it reports again.
  ///
  /// These are starting values, not settled ones. The Foundation defers the
  /// production update policy until it has been measured on real devices —
  /// battery cost is not something to guess at.
  static const LocationSettings _settings = LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: 25,
  );

  @override
  Future<Result<LocationSnapshot>> currentLocation() async {
    final permission = await _ensurePermission();
    if (permission != null) {
      return Err<LocationSnapshot>(permission);
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: _settings,
      );
      return Ok<LocationSnapshot>(_toSnapshot(position));
    } on Object catch (error) {
      return Err<LocationSnapshot>(
        UnexpectedFailure(
          debugMessage: 'could not read the device location',
          cause: error,
        ),
      );
    }
  }

  @override
  Stream<LocationSnapshot> watchLocation() => Geolocator.getPositionStream(
    locationSettings: _settings,
  ).map(_toSnapshot);

  /// Returns `null` when location may be read, or the failure explaining why
  /// not.
  ///
  /// Nothing here asks for permission on behalf of a person who has not been
  /// told what it is for. Requesting it is a decision the interface makes,
  /// having explained what will be shared, which is what the Charter's consent
  /// principle requires.
  Future<Failure?> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const UnexpectedFailure(
        debugMessage: 'location services are switched off',
      );
    }

    final permission = await Geolocator.checkPermission();

    return switch (permission) {
      LocationPermission.always || LocationPermission.whileInUse => null,
      LocationPermission.deniedForever => const PermissionDeniedFailure(
        permission: PermissionKind.locationWhenInUse,
        permanentlyDenied: true,
      ),
      LocationPermission.denied ||
      LocationPermission.unableToDetermine => const PermissionDeniedFailure(
        permission: PermissionKind.locationWhenInUse,
      ),
    };
  }

  /// Maps the plugin's type into the application's own.
  ///
  /// This mapping is the boundary. A `Position` never travels further than this
  /// method.
  LocationSnapshot _toSnapshot(Position position) => LocationSnapshot(
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMeters: position.accuracy,
    capturedAt: position.timestamp,
    receivedAt: clock.nowUtc(),
  );
}
