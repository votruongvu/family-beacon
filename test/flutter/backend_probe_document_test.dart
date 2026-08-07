import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:family_beacon/features/diagnostics/data/dto/backend_probe_document.dart';
import 'package:family_beacon/features/diagnostics/domain/entities/backend_probe.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final probe = BackendProbe(
    ownerId: 'user-1',
    recordedAt: DateTime.utc(2026, 8, 7, 12, 30),
    note: 'probe',
  );

  group('writing', () {
    test('stores the timestamp as a datastore timestamp, not a string', () {
      final document = BackendProbeDocument.toDocument(probe);

      expect(document[BackendProbeFields.recordedAt], isA<Timestamp>());
    });

    test('does not store the owner as a field', () {
      // The owner is the document name. Duplicating it as a field would let the
      // two drift apart, and the rules decide access from the name.
      final document = BackendProbeDocument.toDocument(probe);

      expect(document.keys, isNot(contains('ownerId')));
      expect(document.keys, <String>[
        BackendProbeFields.recordedAt,
        BackendProbeFields.note,
      ]);
    });
  });

  group('reading', () {
    test('round-trips without losing anything', () {
      final restored = BackendProbeDocument.fromDocument(
        'user-1',
        BackendProbeDocument.toDocument(probe),
      );

      expect(restored, probe);
    });

    test('takes the owner from the document name', () {
      final restored = BackendProbeDocument.fromDocument(
        'someone-else',
        BackendProbeDocument.toDocument(probe),
      );

      expect(restored.ownerId, 'someone-else');
    });

    test('refuses a document missing its timestamp', () {
      expect(
        () => BackendProbeDocument.fromDocument('user-1', <String, Object?>{
          'note': 'probe',
        }),
        throwsFormatException,
      );
    });

    test('refuses a document whose timestamp is the wrong type', () {
      expect(
        () => BackendProbeDocument.fromDocument('user-1', <String, Object?>{
          BackendProbeFields.recordedAt: '2026-08-07',
          BackendProbeFields.note: 'probe',
        }),
        throwsFormatException,
        reason:
            'a string that looks like a date is exactly the shape that would slip through',
      );
    });

    test('refuses a document missing its note', () {
      expect(
        () => BackendProbeDocument.fromDocument('user-1', <String, Object?>{
          BackendProbeFields.recordedAt: Timestamp.fromDate(DateTime.utc(2026)),
        }),
        throwsFormatException,
      );
    });

    test('refuses an empty document rather than inventing a probe', () {
      expect(
        () => BackendProbeDocument.fromDocument('user-1', <String, Object?>{}),
        throwsFormatException,
      );
    });
  });
}
