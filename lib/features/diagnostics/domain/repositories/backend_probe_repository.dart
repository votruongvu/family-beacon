/// The contract the proof slice is written against.
library;

import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';

/// Stores and retrieves [BackendProbe] records.
///
/// Declared in the domain and implemented in the data layer. Nothing in this
/// file, or anything it imports, knows which datastore is behind it.
abstract interface class BackendProbeRepository {
  /// Writes [probe], replacing any previous one for the same owner.
  Future<Result<BackendProbe>> record(BackendProbe probe);

  /// Reads the probe belonging to [ownerId], or `null` when there is none.
  ///
  /// A missing probe is an ordinary answer, not a failure. A refusal is a
  /// failure, and the two are distinguishable by the caller.
  Future<Result<BackendProbe?>> latestFor(String ownerId);
}
