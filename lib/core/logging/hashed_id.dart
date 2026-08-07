/// Identifier hashing for diagnostics.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

/// An identifier that is safe to write to a log.
///
/// The only way to obtain one is [HashedId.of], so a raw identifier cannot
/// reach a log by accident: the logging API accepts this type and nothing else.
///
/// This is for opaque identifiers — a user id, a family id, an assistance
/// event id. It is deliberately **not** for a phone number. A phone number has
/// a small enough search space that a hash of it can be reversed by
/// enumeration, so phone numbers do not belong in diagnostics in any form.
final class HashedId {
  const HashedId._(this.value);

  /// Hashes [rawIdentifier] into a short, stable, non-reversible token.
  ///
  /// The same identifier always produces the same token, so events can be
  /// correlated without the identifier itself ever being written down.
  factory HashedId.of(String rawIdentifier) {
    final digest = sha256.convert(utf8.encode(rawIdentifier));
    return HashedId._(digest.toString().substring(0, _tokenLength));
  }

  /// How much of the digest is kept.
  ///
  /// Sixteen hexadecimal characters is 64 bits — far beyond what a family-sized
  /// data set can collide on, and short enough to stay readable in a log line.
  static const int _tokenLength = 16;

  /// The token to log.
  final String value;

  @override
  bool operator ==(Object other) => other is HashedId && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}
