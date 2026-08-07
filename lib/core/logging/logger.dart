/// The logging contract the whole application depends on.
library;

import 'package:family_beacon/core/logging/log_event.dart';

/// Records diagnostics.
///
/// The contract is deliberately narrow. A caller describes what happened with a
/// [LogEvent]; it cannot hand the logger arbitrary text, so there is no path
/// for a sensitive value to reach a log through this interface.
///
/// Implementations live outside the core — a console implementation for
/// development, a crash-reporting implementation for release.
abstract interface class Logger {
  /// Records that something happened.
  void record(LogEvent event);

  /// Records a failure together with the error that caused it.
  ///
  /// [error] and [stackTrace] go to crash reporting, never to a log line.
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace});
}

/// A logger that discards everything.
///
/// Useful in tests and as a safe default before the real logger is wired.
final class SilentLogger implements Logger {
  /// Creates a logger that does nothing.
  const SilentLogger();

  @override
  void record(LogEvent event) {}

  @override
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace}) {}
}

/// A logger that keeps what it was given, for assertions in tests.
final class RecordingLogger implements Logger {
  /// Creates a recording logger.
  RecordingLogger();

  final List<LogEvent> _events = <LogEvent>[];

  /// Everything recorded so far, oldest first.
  List<LogEvent> get events => List<LogEvent>.unmodifiable(_events);

  @override
  void record(LogEvent event) => _events.add(event);

  @override
  void recordFailure(LogEvent event, {Object? error, StackTrace? stackTrace}) =>
      _events.add(event);
}
