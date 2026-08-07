/// A location source that answers from what it was given.
library;

import 'dart:async';

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/location/location_snapshot.dart';
import 'package:family_beacon/core/location/location_source.dart';
import 'package:family_beacon/core/result/result.dart';

/// A [LocationSource] driven by a test rather than by a device.
///
/// This exists to prove the boundary is real: it is a complete, working
/// implementation that shares no code and no dependency with the platform
/// adapter, and anything written against [LocationSource] works with either
/// without modification.
///
/// It also makes the awkward cases testable. Refused permission, a device that
/// cannot get a fix, and a reading that arrived late are all states the product
/// has to represent honestly, and none of them are reproducible on demand from
/// a real sensor.
final class InMemoryLocationSource implements LocationSource {
  /// Creates a source that returns [initial], or fails with [failure].
  InMemoryLocationSource({LocationSnapshot? initial, Failure? failure}) {
    _current = initial;
    _failure = failure;
  }

  /// Creates a source that always refuses, as a device without permission does.
  factory InMemoryLocationSource.permissionDenied({bool permanently = false}) =>
      InMemoryLocationSource(
        failure: PermissionDeniedFailure(
          permission: PermissionKind.locationWhenInUse,
          permanentlyDenied: permanently,
        ),
      );

  LocationSnapshot? _current;
  Failure? _failure;
  final StreamController<LocationSnapshot> _controller =
      StreamController<LocationSnapshot>.broadcast();

  /// Replaces what the next read returns, and notifies watchers.
  void emit(LocationSnapshot snapshot) {
    _current = snapshot;
    _failure = null;
    _controller.add(snapshot);
  }

  /// Makes every subsequent read fail with [failure].
  void fail(Failure failure) {
    _failure = failure;
    _current = null;
  }

  /// Releases the stream.
  Future<void> dispose() => _controller.close();

  @override
  Future<Result<LocationSnapshot>> currentLocation() async {
    final failure = _failure;
    if (failure != null) {
      return Err<LocationSnapshot>(failure);
    }

    final current = _current;
    if (current == null) {
      return const Err<LocationSnapshot>(
        UnexpectedFailure(debugMessage: 'no location has been provided'),
      );
    }

    return Ok<LocationSnapshot>(current);
  }

  @override
  Stream<LocationSnapshot> watchLocation() => _controller.stream;
}
