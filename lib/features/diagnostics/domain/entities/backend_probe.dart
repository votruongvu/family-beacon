/// The thing the proof slice writes and reads back.
library;

/// A record that the application reached the backend and was allowed to.
///
/// Deliberately not a product concept. It exists so the Foundation can show a
/// request travelling the whole way — interface, provider, use case, contract,
/// implementation, datastore — and returning, before any capability depends on
/// that path working.
///
/// It is owned by one person and readable only by them, so even this carries no
/// risk of becoming a way to see something about somebody else.
final class BackendProbe {
  /// Creates a probe.
  BackendProbe({
    required this.ownerId,
    required DateTime recordedAt,
    required this.note,
  }) : recordedAt = recordedAt.toUtc() {
    if (ownerId.isEmpty) {
      throw ArgumentError.value(ownerId, 'ownerId', 'must identify someone');
    }
    if (note.length > maximumNoteLength) {
      throw ArgumentError.value(
        note.length,
        'note',
        'must be at most $maximumNoteLength characters',
      );
    }
  }

  /// The longest note a probe will carry.
  ///
  /// Bounded so the proof slice cannot become a general-purpose store for
  /// whatever somebody decides to put in it.
  static const int maximumNoteLength = 200;

  /// Who the probe belongs to. Also its document identifier.
  final String ownerId;

  /// When it was recorded, in UTC.
  final DateTime recordedAt;

  /// A short, non-sensitive label.
  final String note;

  @override
  bool operator ==(Object other) =>
      other is BackendProbe &&
      other.ownerId == ownerId &&
      other.recordedAt == recordedAt &&
      other.note == note;

  @override
  int get hashCode => Object.hash(ownerId, recordedAt, note);

  @override
  String toString() => 'BackendProbe(recordedAt: $recordedAt, note: $note)';
}
