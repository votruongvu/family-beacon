/// The shape of every diagnostic this application records.
library;

import 'package:family_beacon/core/logging/hashed_id.dart';

/// How much a log entry matters.
enum LogLevel {
  /// Ordinary progress, useful when reconstructing a sequence.
  info,

  /// Something unexpected that the application recovered from.
  warning,

  /// An operation failed in a way the person will notice.
  error,
}

/// Whether an operation finished, failed, or was refused.
enum LogOutcome {
  /// The operation completed.
  success,

  /// The operation failed.
  failure,

  /// The operation was refused by an authorization or permission boundary.
  denied,
}

/// One structured diagnostic entry.
///
/// The field list is closed on purpose. There is no free-form payload, because
/// a free-form payload is how a coordinate, a phone number, or a token ends up
/// in a log. Identifiers are [HashedId], and everything else is either an
/// enumerated value or a short non-sensitive string the developer wrote.
final class LogEvent {
  /// Creates a diagnostic entry.
  const LogEvent({
    required this.feature,
    required this.operation,
    required this.outcome,
    this.level = LogLevel.info,
    this.errorCode,
    this.userId,
    this.familyId,
  });

  /// Which part of the product the operation belongs to.
  final String feature;

  /// What was being attempted.
  final String operation;

  /// How it ended.
  final LogOutcome outcome;

  /// How much this entry matters.
  final LogLevel level;

  /// The failure code, when the operation did not succeed.
  ///
  /// This is a `Failure.code` — a fixed vocabulary, never a message built from
  /// the data that failed.
  final String? errorCode;

  /// Who was acting, hashed.
  final HashedId? userId;

  /// Which family the operation concerned, hashed.
  final HashedId? familyId;

  /// The entry as key and value pairs, ready for a logging backend.
  Map<String, String> toFields() => <String, String>{
    'feature': feature,
    'operation': operation,
    'outcome': outcome.name,
    'level': level.name,
    'errorCode': ?errorCode,
    'userId': ?userId?.value,
    'familyId': ?familyId?.value,
  };

  @override
  String toString() => toFields().entries
      .map((entry) => '${entry.key}=${entry.value}')
      .join(' ');
}
