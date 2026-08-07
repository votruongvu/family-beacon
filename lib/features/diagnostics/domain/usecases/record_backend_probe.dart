/// Records that the backend was reachable.
library;

import 'package:family_beacon/core/result/result.dart';
import 'package:family_beacon/core/time/clock.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:family_beacon/features/diagnostics/domain/repositories/backend_probe_repository.dart';

/// Writes a probe for the caller and hands back what was stored.
///
/// Trivial on purpose. What it demonstrates is the shape every use case takes:
/// it holds the rule about *when* something is true — here, that the time
/// recorded comes from the application's clock and not from the caller — and it
/// reaches the outside world only through a contract.
final class RecordBackendProbe {
  /// Creates the use case.
  const RecordBackendProbe({required this.repository, required this.clock});

  /// Where probes are stored.
  final BackendProbeRepository repository;

  /// Where the recorded time comes from.
  final Clock clock;

  /// Records a probe owned by [ownerId].
  Future<Result<BackendProbe>> call({
    required String ownerId,
    String note = 'probe',
  }) {
    final probe = BackendProbe(
      ownerId: ownerId,
      recordedAt: clock.nowUtc(),
      note: note,
    );

    return repository.record(probe);
  }
}
