/// Dependencies every feature may resolve.
///
/// This layer exists because of a real tension. The shared core is pure Dart,
/// so it cannot hold a provider. The application layer can, but a feature
/// reaching back into it would invert the dependency direction — the
/// application composes features, not the other way round.
///
/// So: `core` is pure and knows nothing; `shared` is framework-aware, knows no
/// feature, and is what features resolve common dependencies from; `app` wires
/// everything and may override any of it at startup. The architecture check
/// enforces each of those.
library;

import 'package:family_beacon/core/logging/logger.dart';
import 'package:family_beacon/core/time/clock.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Where diagnostics go.
///
/// Defaults to discarding them, so a widget test that exercises a code path
/// which logs does not need to know that. The real logger is installed at
/// startup.
final Provider<Logger> loggerProvider = Provider<Logger>(
  (ref) => const SilentLogger(),
);

/// The current time.
///
/// Read through a provider rather than called directly, so freshness and expiry
/// decisions can be tested without waiting for real time to pass. Location
/// staleness and assistance expiry both depend on this being substitutable.
final Provider<Clock> clockProvider = Provider<Clock>(
  (ref) => const SystemClock(),
);

/// Who is signed in, or `null`.
///
/// A placeholder reading the authentication client directly. The authentication
/// Requirement replaces it with one backed by the identity stream, so that
/// signing in and out re-evaluates whatever depends on it. Features resolve it
/// from here either way and do not change when it is replaced.
///
/// Identity is not authorization. Holding an identifier says who someone is,
/// never what they may read.
final Provider<String?> currentUserIdProvider = Provider<String?>(
  (ref) => FirebaseAuth.instance.currentUser?.uid,
);
