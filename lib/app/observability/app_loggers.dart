/// The logger implementations, which live outside the shared core because they
/// depend on infrastructure.
library;

import 'dart:developer' as developer;

import 'package:family_beacon/core/logging/log_event.dart';
import 'package:family_beacon/core/logging/logger.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

/// Writes diagnostics to the debug console.
///
/// Used during development. It writes the same structured fields the release
/// logger sends onwards, so what a developer reads locally matches what is
/// diagnosed later.
final class ConsoleLogger implements Logger {
  /// Creates a console logger.
  const ConsoleLogger();

  @override
  void record(LogEvent event) {
    developer.log(
      event.toString(),
      name: 'family_beacon.${event.feature}',
      level: _levelFor(event.level),
    );
  }

  @override
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace}) {
    developer.log(
      event.toString(),
      name: 'family_beacon.${event.feature}',
      level: _levelFor(LogLevel.error),
      error: error,
      stackTrace: stackTrace,
    );
  }

  static int _levelFor(LogLevel level) => switch (level) {
    LogLevel.info => 800,
    LogLevel.warning => 900,
    LogLevel.error => 1000,
  };
}

/// Sends diagnostics to crash reporting.
///
/// Only the structured fields travel. The event model has no free-form payload,
/// so there is no path by which a coordinate, a phone number, or a token
/// reaches the crash-reporting backend through this logger.
final class CrashlyticsLogger implements Logger {
  /// Creates a logger backed by the given crash-reporting client.
  const CrashlyticsLogger(this._crashlytics);

  final FirebaseCrashlytics _crashlytics;

  @override
  void record(LogEvent event) {
    _crashlytics.log(event.toString());
  }

  @override
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace}) {
    _crashlytics
      ..log(event.toString())
      ..recordError(
        error ?? StateError(event.errorCode ?? 'unknown'),
        stackTrace,
        reason: '${event.feature}/${event.operation}',
        fatal: false,
      );
  }
}

/// Sends every event to each of [_delegates].
final class FanOutLogger implements Logger {
  /// Creates a logger that forwards to several others.
  const FanOutLogger(this._delegates);

  final List<Logger> _delegates;

  @override
  void record(LogEvent event) {
    for (final delegate in _delegates) {
      delegate.record(event);
    }
  }

  @override
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace}) {
    for (final delegate in _delegates) {
      delegate.recordFailure(event, error: error, stackTrace: stackTrace);
    }
  }
}
