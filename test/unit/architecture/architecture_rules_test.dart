@TestOn('vm')
library;

import 'dart:io';

import 'package:test/test.dart';

import '../../tool/architecture/architecture_rules.dart';

void main() {
  const check = ArchitectureCheck();

  List<Violation> checkFile(String path, String source) =>
      check.checkSource(path: path, source: source);

  group('pure zone isolation', () {
    test('rejects a framework import in a domain layer', () {
      final violations = checkFile(
        'lib/features/sos/domain/entities/sos_event.dart',
        "import 'package:flutter/material.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'pure_zone_isolation');
      expect(violations.single.line, 1);
    });

    test('rejects every infrastructure package a data layer is allowed', () {
      const infrastructure = <String>[
        'package:cloud_firestore/cloud_firestore.dart',
        'package:firebase_auth/firebase_auth.dart',
        'package:firebase_core/firebase_core.dart',
        'package:firebase_messaging/firebase_messaging.dart',
        'package:geolocator/geolocator.dart',
        'package:google_maps_flutter/google_maps_flutter.dart',
      ];

      for (final import in infrastructure) {
        expect(
          checkFile(
            'lib/features/family/domain/repositories/x.dart',
            "import '$import';",
          ),
          hasLength(1),
          reason: '$import should not be importable from a domain layer',
        );
      }
    });

    test('rejects dart:io and dart:ui, which are platform surfaces', () {
      expect(
        checkFile('lib/core/time/clock.dart', "import 'dart:io';"),
        hasLength(1),
      );
      expect(
        checkFile('lib/core/time/clock.dart', "import 'dart:ui';"),
        hasLength(1),
      );
    });

    test('allows the pure Dart libraries the core is built from', () {
      const allowed = <String>[
        'dart:async',
        'dart:collection',
        'dart:convert',
        'dart:math',
        'dart:typed_data',
        'package:collection/collection.dart',
        'package:crypto/crypto.dart',
        'package:meta/meta.dart',
      ];

      for (final import in allowed) {
        expect(
          checkFile('lib/core/result/result.dart', "import '$import';"),
          isEmpty,
          reason: '$import should be usable from the shared core',
        );
      }
    });

    test('rejects an export as firmly as an import', () {
      expect(
        checkFile(
          'lib/core/error/failure.dart',
          "export 'package:flutter/foundation.dart';",
        ),
        hasLength(1),
      );
    });

    test('sees through a relative import that escapes the zone', () {
      expect(
        checkFile(
          'lib/features/sos/domain/usecases/activate.dart',
          "import '../../data/repositories/firebase_sos_repository.dart';",
        ),
        hasLength(1),
      );
    });

    test('ignores an import written inside a string or a comment', () {
      const source = '''
// import 'package:flutter/material.dart';
const example = "import 'package:geolocator/geolocator.dart';";
''';

      expect(checkFile('lib/core/result/result.dart', source), isEmpty);
    });
  });

  group('dependency direction', () {
    test('rejects a domain layer importing its own data layer', () {
      final violations = checkFile(
        'lib/features/family/domain/usecases/create_family.dart',
        "import 'package:family_beacon/features/family/data/family_dto.dart';",
      );

      expect(violations, hasLength(1));
      expect(
        violations.single.rule,
        anyOf('pure_zone_isolation', 'dependency_direction'),
      );
    });

    test('rejects a data layer importing a presentation layer', () {
      final violations = checkFile(
        'lib/features/family/data/repositories/family_repository.dart',
        "import 'package:family_beacon/features/family/presentation/pages/home.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'dependency_direction');
    });

    test('rejects a feature reaching back into the application layer', () {
      final violations = checkFile(
        'lib/features/family/presentation/pages/home.dart',
        "import 'package:family_beacon/app/router/routes.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'dependency_direction');
    });

    test('allows a presentation layer to depend on its domain layer', () {
      expect(
        checkFile(
          'lib/features/family/presentation/pages/home.dart',
          "import 'package:family_beacon/features/family/domain/entities/family.dart';",
        ),
        isEmpty,
      );
    });

    test('allows a data layer to depend on its domain layer', () {
      expect(
        checkFile(
          'lib/features/family/data/repositories/firebase_family_repository.dart',
          "import 'package:family_beacon/features/family/domain/repositories/family_repository.dart';",
        ),
        isEmpty,
      );
    });
  });

  group('core independence', () {
    test('rejects the core importing a feature', () {
      final violations = checkFile(
        'lib/core/logging/logger.dart',
        "import 'package:family_beacon/features/sos/domain/entities/sos_event.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'core_independence');
    });

    test('rejects the core importing the application layer', () {
      final violations = checkFile(
        'lib/core/time/clock.dart',
        "import 'package:family_beacon/app/bootstrap.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'core_independence');
    });
  });

  group('cross-feature data coupling', () {
    test('rejects one feature importing another feature data layer', () {
      final violations = checkFile(
        'lib/features/sos/data/repositories/firebase_sos_repository.dart',
        "import 'package:family_beacon/features/family/data/family_dto.dart';",
      );

      expect(violations, hasLength(1));
      expect(violations.single.rule, 'cross_feature_data');
    });

    test('allows one feature to depend on another feature domain contract', () {
      expect(
        checkFile(
          'lib/features/sos/domain/usecases/activate.dart',
          "import 'package:family_beacon/features/family/domain/entities/family.dart';",
        ),
        isEmpty,
      );
    });
  });

  group('running against a checkout', () {
    late Directory sandbox;

    setUp(
      () => sandbox = Directory.systemTemp.createTempSync('architecture_check'),
    );
    tearDown(() => sandbox.deleteSync(recursive: true));

    void write(String relativePath, String source) {
      final file = File('${sandbox.path}/$relativePath')
        ..parent.createSync(recursive: true);
      file.writeAsStringSync(source);
    }

    test('passes on a tree that respects the rules', () {
      write(
        'lib/features/sos/domain/entities/sos_event.dart',
        "import 'package:family_beacon/core/time/clock.dart';\nclass SosEvent {}\n",
      );
      write(
        'lib/features/sos/data/repositories/sos_repository.dart',
        "import 'package:cloud_firestore/cloud_firestore.dart';\nclass Repo {}\n",
      );

      expect(ArchitectureCheck(root: sandbox.path).run(), isEmpty);
    });

    test('fails once an infrastructure import appears in a domain file', () {
      const path = 'lib/features/sos/domain/entities/sos_event.dart';
      write(path, 'class SosEvent {}\n');
      expect(ArchitectureCheck(root: sandbox.path).run(), isEmpty);

      write(
        path,
        "import 'package:cloud_firestore/cloud_firestore.dart';\nclass SosEvent {}\n",
      );
      final violations = ArchitectureCheck(root: sandbox.path).run();

      expect(violations, hasLength(1));
      expect(violations.single.file, path);
      expect(violations.single.rule, 'pure_zone_isolation');

      write(path, 'class SosEvent {}\n');
      expect(
        ArchitectureCheck(root: sandbox.path).run(),
        isEmpty,
        reason: 'removing the import should make the check pass again',
      );
    });

    test('reports nothing when there is no lib directory', () {
      expect(ArchitectureCheck(root: sandbox.path).run(), isEmpty);
    });
  });

  test('the real source tree respects its own rules', () {
    expect(
      const ArchitectureCheck().run(),
      isEmpty,
      reason: 'lib/ must satisfy the dependency rules of ENG-FND-0001',
    );
  });
}
