/// Wiring for the proof slice.
///
/// Shows the shape every feature's providers take: resolve dependencies,
/// invoke a use case, expose asynchronous state. No rule is decided here.
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/features/diagnostics/data/repositories/firestore_backend_probe_repository.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:family_beacon/features/diagnostics/domain/repositories/backend_probe_repository.dart';
import 'package:family_beacon/features/diagnostics/domain/usecases/record_backend_probe.dart';
import 'package:family_beacon/shared/di/shared_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The datastore client.
///
/// A provider rather than a direct `FirebaseFirestore.instance` call, so a test
/// can substitute one pointed at an emulator without the feature knowing.
final Provider<FirebaseFirestore> firestoreProvider =
    Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

/// The contract, bound to its datastore implementation.
final Provider<BackendProbeRepository> backendProbeRepositoryProvider =
    Provider<BackendProbeRepository>(
      (ref) => FirestoreBackendProbeRepository(ref.watch(firestoreProvider)),
    );

/// The use case.
final Provider<RecordBackendProbe> recordBackendProbeProvider =
    Provider<RecordBackendProbe>(
      (ref) => RecordBackendProbe(
        repository: ref.watch(backendProbeRepositoryProvider),
        clock: ref.watch(clockProvider),
      ),
    );

/// Writes a probe for the given owner and reads it back.
///
/// The round trip is the point: a value that only proves a write succeeded
/// would not show that the rules allow reading it again, nor that the mapping
/// survives the journey in both directions.
final backendProbeRoundTripProvider =
    FutureProvider.family<BackendProbe?, String>((ref, ownerId) async {
      final written = await ref.watch(recordBackendProbeProvider)(
        ownerId: ownerId,
      );

      return switch (written) {
        Err<BackendProbe>(:final failure) => throw failure,
        Ok<BackendProbe>() => switch (await ref
            .watch(backendProbeRepositoryProvider)
            .latestFor(ownerId)) {
          Ok<BackendProbe?>(:final value) => value,
          Err<BackendProbe?>(:final failure) => throw failure,
        },
      };
    });
