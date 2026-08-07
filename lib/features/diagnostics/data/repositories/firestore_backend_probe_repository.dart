/// The datastore-backed implementation of the proof slice's contract.
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/features/diagnostics/data/dto/backend_probe_document.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:family_beacon/features/diagnostics/domain/repositories/backend_probe_repository.dart';

/// Stores probes in the datastore.
///
/// Shows the translation the Shared Contract requires: every datastore
/// exception is caught here and converted into a typed failure, so nothing
/// above this file ever handles an infrastructure error.
final class FirestoreBackendProbeRepository implements BackendProbeRepository {
  /// Creates a repository backed by the given datastore client.
  const FirestoreBackendProbeRepository(this._firestore);

  /// The collection probes live in.
  static const String collectionPath = 'diagnostics';

  final FirebaseFirestore _firestore;

  DocumentReference<Map<String, Object?>> _documentFor(String ownerId) =>
      _firestore.collection(collectionPath).doc(ownerId);

  @override
  Future<Result<BackendProbe>> record(BackendProbe probe) async {
    try {
      await _documentFor(
        probe.ownerId,
      ).set(BackendProbeDocument.toDocument(probe));
      return Ok<BackendProbe>(probe);
    } on FirebaseException catch (error, stackTrace) {
      return Err<BackendProbe>(_translate(error, stackTrace));
    }
  }

  @override
  Future<Result<BackendProbe?>> latestFor(String ownerId) async {
    try {
      final snapshot = await _documentFor(ownerId).get();
      final data = snapshot.data();

      if (!snapshot.exists || data == null) {
        // Absence is an answer, not a failure.
        return const Ok<BackendProbe?>(null);
      }

      return Ok<BackendProbe?>(
        BackendProbeDocument.fromDocument(ownerId, data),
      );
    } on FirebaseException catch (error, stackTrace) {
      return Err<BackendProbe?>(_translate(error, stackTrace));
    } on FormatException catch (error) {
      return Err<BackendProbe?>(
        UnexpectedFailure(
          debugMessage: 'stored probe has an unexpected shape',
          cause: error,
        ),
      );
    }
  }

  /// Turns a datastore exception into something the rest of the application
  /// was built to handle.
  ///
  /// `permission-denied` is deliberately mapped to an authorization failure
  /// rather than to something generic: it means the backend refused, and that
  /// is a different situation from the network being down, both for what the
  /// interface should say and for what deserves investigating.
  Failure _translate(FirebaseException error, StackTrace stackTrace) =>
      switch (error.code) {
        'permission-denied' => AuthorizationFailure(
          debugMessage: error.code,
          cause: error,
        ),
        'unavailable' || 'deadline-exceeded' => NetworkUnavailableFailure(
          debugMessage: error.code,
          cause: error,
        ),
        _ => UnexpectedFailure(debugMessage: error.code, cause: error),
      };
}
