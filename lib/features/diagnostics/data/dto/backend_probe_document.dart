/// The mapping between the stored document and the domain entity.
///
/// This is the boundary the Shared Contract talks about: a datastore type is
/// converted by named code, in one place, and never travels further inward.
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';

/// Field names, written once so a typo is a compile error rather than a silent
/// read of nothing.
abstract final class BackendProbeFields {
  /// When the probe was recorded.
  static const String recordedAt = 'recordedAt';

  /// The short label.
  static const String note = 'note';
}

/// Converts between stored documents and [BackendProbe].
abstract final class BackendProbeDocument {
  /// Builds the document body for [probe].
  ///
  /// The identifier is the document name, not a field, so it cannot drift away
  /// from the path the rules use to decide who may read it.
  static Map<String, Object?> toDocument(BackendProbe probe) =>
      <String, Object?>{
        BackendProbeFields.recordedAt: Timestamp.fromDate(probe.recordedAt),
        BackendProbeFields.note: probe.note,
      };

  /// Builds a [BackendProbe] from a stored document.
  ///
  /// Throws [FormatException] when the stored shape is not what this version
  /// expects. Failing here is right: the data layer catches it and turns it
  /// into a typed failure, whereas a half-populated entity would travel inward
  /// and break somewhere far less obvious.
  static BackendProbe fromDocument(String ownerId, Map<String, Object?> data) {
    final recordedAt = data[BackendProbeFields.recordedAt];
    final note = data[BackendProbeFields.note];

    if (recordedAt is! Timestamp) {
      throw FormatException(
        '${BackendProbeFields.recordedAt} is missing or not a timestamp',
      );
    }
    if (note is! String) {
      throw FormatException(
        '${BackendProbeFields.note} is missing or not a string',
      );
    }

    return BackendProbe(
      ownerId: ownerId,
      recordedAt: recordedAt.toDate(),
      note: note,
    );
  }
}
