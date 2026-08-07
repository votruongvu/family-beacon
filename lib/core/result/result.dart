/// The value every operation that can fail returns.
library;

import 'package:family_beacon/core/error/failure.dart';

/// Either a value or a [Failure].
///
/// Returned rather than thrown, so a caller cannot forget that an operation
/// might not have worked. This type is `sealed`, so a `switch` over [Ok] and
/// [Err] is exhaustive and the analyzer catches a forgotten branch.
sealed class Result<T> {
  /// Creates a result.
  const Result();

  /// Whether this result carries a value.
  bool get isOk => this is Ok<T>;

  /// The value, or `null` when this result is an [Err].
  ///
  /// Prefer a `switch`. This is for the places where a missing value and a
  /// failure genuinely lead to the same behavior.
  T? get valueOrNull => switch (this) {
    Ok<T>(:final value) => value,
    Err<T>() => null,
  };

  /// The failure, or `null` when this result is an [Ok].
  Failure? get failureOrNull => switch (this) {
    Ok<T>() => null,
    Err<T>(:final failure) => failure,
  };

  /// Applies [onOk] or [onErr] and returns the result.
  R fold<R>(R Function(T value) onOk, R Function(Failure failure) onErr) =>
      switch (this) {
        Ok<T>(:final value) => onOk(value),
        Err<T>(:final failure) => onErr(failure),
      };

  /// Transforms a carried value, leaving a failure untouched.
  Result<R> map<R>(R Function(T value) transform) => switch (this) {
    Ok<T>(:final value) => Ok<R>(transform(value)),
    Err<T>(:final failure) => Err<R>(failure),
  };

  /// Chains another operation that can itself fail.
  Result<R> flatMap<R>(Result<R> Function(T value) transform) => switch (this) {
    Ok<T>(:final value) => transform(value),
    Err<T>(:final failure) => Err<R>(failure),
  };
}

/// A successful result carrying [value].
final class Ok<T> extends Result<T> {
  /// Creates a successful result.
  const Ok(this.value);

  /// The value produced by the operation.
  final T value;

  @override
  bool operator ==(Object other) => other is Ok<T> && other.value == value;

  @override
  int get hashCode => Object.hash(Ok<T>, value);

  @override
  String toString() => 'Ok($value)';
}

/// A failed result carrying [failure].
final class Err<T> extends Result<T> {
  /// Creates a failed result.
  const Err(this.failure);

  /// Why the operation did not produce a value.
  final Failure failure;

  @override
  bool operator ==(Object other) => other is Err<T> && other.failure == failure;

  @override
  int get hashCode => Object.hash(Err<T>, failure);

  @override
  String toString() => 'Err($failure)';
}

/// An operation that produces nothing but can still fail.
typedef VoidResult = Result<void>;
