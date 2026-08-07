/// The visible end of the proof slice.
///
/// Shows the shape a feature's presentation layer takes: it watches a provider,
/// renders the three states that provider can be in, and decides nothing.
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:family_beacon/features/diagnostics/presentation/providers/diagnostics_providers.dart';
import 'package:family_beacon/shared/di/shared_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Writes a probe and shows what came back.
class DiagnosticsPage extends ConsumerWidget {
  /// Creates the diagnostics page.
  const DiagnosticsPage({super.key});

  /// Identifies the result text, so a test can find it without matching on
  /// wording that is expected to change.
  static const Key resultKey = Key('diagnostics-result');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String? ownerId = ref.watch(currentUserIdProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Diagnostics')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ownerId == null
              ? const Text(
                  key: resultKey,
                  'Sign in to run the backend round trip.',
                  textAlign: TextAlign.center,
                )
              : _RoundTripResult(ownerId: ownerId),
        ),
      ),
    );
  }
}

class _RoundTripResult extends ConsumerWidget {
  const _RoundTripResult({required this.ownerId});

  final String ownerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<BackendProbe?> roundTrip = ref.watch(
      backendProbeRoundTripProvider(ownerId),
    );

    return switch (roundTrip) {
      AsyncData<BackendProbe?>(:final value) when value != null => Text(
        key: DiagnosticsPage.resultKey,
        'Round trip succeeded at ${value.recordedAt.toIso8601String()}',
        textAlign: TextAlign.center,
      ),
      AsyncData<BackendProbe?>() => const Text(
        key: DiagnosticsPage.resultKey,
        'Wrote a probe but read nothing back.',
        textAlign: TextAlign.center,
      ),
      AsyncError<BackendProbe?>(:final error) => Text(
        key: DiagnosticsPage.resultKey,
        // A failure code, never the underlying exception: the interface says
        // what happened, and the detail goes to crash reporting.
        'Round trip failed: ${error is Failure ? error.code : 'unexpected'}',
        textAlign: TextAlign.center,
      ),
      _ => const CircularProgressIndicator(),
    };
  }
}
