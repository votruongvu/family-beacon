/// The dependency rules of ENG-FND-0001, expressed as something a machine can
/// check.
///
/// The analyzer cannot say "this directory may not import that package", so the
/// rules that actually protect the architecture live here instead. This library
/// is deliberately free of any dependency beyond `dart:io`, so it runs on a
/// bare checkout and in continuous integration without resolving anything.
library;

import 'dart:io';

/// The package name this application publishes its own libraries under.
const String packageName = 'family_beacon';

/// What may be imported from inside a pure zone.
///
/// An allowlist rather than a denylist, so a dependency added next year is
/// rejected by default instead of quietly slipping past a list nobody updated.
const Set<String> allowedPureExternalImports = <String>{
  'dart:async',
  'dart:collection',
  'dart:convert',
  'dart:math',
  'dart:typed_data',
  'package:collection/',
  'package:crypto/',
  'package:meta/',
};

/// A rule that was broken.
final class Violation {
  /// Creates a violation.
  const Violation({
    required this.file,
    required this.line,
    required this.rule,
    required this.message,
  });

  /// The offending file, relative to the repository root.
  final String file;

  /// The line the import sits on, counting from one.
  final int line;

  /// Which rule was broken.
  final String rule;

  /// What is wrong, in one sentence.
  final String message;

  @override
  String toString() => '$file:$line  [$rule] $message';
}

/// One `import` or `export` found in a source file.
final class _Directive {
  const _Directive(this.uri, this.line);

  final String uri;
  final int line;
}

/// Where a file sits in the architecture.
final class Zone {
  /// Creates a zone description for [path].
  factory Zone.of(String path) {
    final segments = path.split('/');
    final layerIndex = segments.indexWhere(
      (segment) =>
          segment == 'domain' || segment == 'data' || segment == 'presentation',
    );
    final feature =
        segments.length > 2 && segments[0] == 'lib' && segments[1] == 'features'
        ? segments[2]
        : null;
    return Zone._(
      path: path,
      feature: feature,
      layer: layerIndex == -1 ? null : segments[layerIndex],
      isCore: path.startsWith('lib/core/'),
      isApp: path.startsWith('lib/app/'),
    );
  }

  const Zone._({
    required this.path,
    required this.feature,
    required this.layer,
    required this.isCore,
    required this.isApp,
  });

  /// The file this describes.
  final String path;

  /// The feature it belongs to, or `null` outside `lib/features`.
  final String? feature;

  /// `domain`, `data`, `presentation`, or `null`.
  final String? layer;

  /// Whether it is part of the shared core.
  final bool isCore;

  /// Whether it is part of the application wiring layer.
  final bool isApp;

  /// Whether framework and infrastructure imports are forbidden here.
  ///
  /// The shared core and every domain layer are pure Dart. Everything that
  /// needs a framework, an SDK, or the platform lives in `lib/app`, in a
  /// feature's `data` layer, or in a feature's `presentation` layer.
  bool get isPure => isCore || layer == 'domain';
}

/// Checks the dependency rules.
final class ArchitectureCheck {
  /// Creates a check rooted at [root], the directory holding `lib`.
  const ArchitectureCheck({this.root = '.'});

  /// The repository root.
  final String root;

  /// Checks every Dart file under `lib` and returns what is wrong.
  ///
  /// The result is ordered by file and then by line, so the output is stable
  /// enough to diff between runs.
  List<Violation> run() {
    final libDirectory = Directory('$root/lib');
    if (!libDirectory.existsSync()) {
      return const <Violation>[];
    }
    final violations = <Violation>[];
    final files =
        libDirectory
            .listSync(recursive: true)
            .whereType<File>()
            .where((file) => file.path.endsWith('.dart'))
            .toList()
          ..sort((a, b) => a.path.compareTo(b.path));

    for (final file in files) {
      final relative = _relative(file.path);
      violations.addAll(
        checkSource(path: relative, source: file.readAsStringSync()),
      );
    }
    return violations;
  }

  /// Checks one file's [source], addressed as [path] relative to the root.
  ///
  /// Exposed separately from [run] so the rules can be tested against sources
  /// held in memory, without a checkout that deliberately breaks them.
  List<Violation> checkSource({required String path, required String source}) {
    final zone = Zone.of(path);
    final violations = <Violation>[];

    for (final directive in _directivesIn(source)) {
      final target = _resolve(directive.uri, from: path);

      void report(String rule, String message) {
        violations.add(
          Violation(
            file: path,
            line: directive.line,
            rule: rule,
            message: message,
          ),
        );
      }

      if (target == null) {
        // An import of something outside this package.
        if (zone.isPure && !_isAllowedPureExternal(directive.uri)) {
          report(
            'pure_zone_isolation',
            '${zone.isCore ? 'The shared core' : 'A domain layer'} may not import '
                '`${directive.uri}`. Put the code that needs it behind a contract '
                'in this layer and implement that contract in a data layer or in '
                'lib/app.',
          );
        }
        continue;
      }

      final targetZone = Zone.of(target);

      // The specific rules are tried before the general one, so a violation is
      // reported under the rule that explains it best. A core file reaching
      // into a feature is a core-independence problem; saying only that it left
      // a pure zone would be true but much less useful.
      if (zone.isCore && (targetZone.feature != null || targetZone.isApp)) {
        report(
          'core_independence',
          'The shared core may not import `$target`. The core is depended on by '
              'features, never the reverse.',
        );
        continue;
      }

      if (zone.layer == 'domain' &&
          (targetZone.layer == 'data' || targetZone.isApp)) {
        report(
          'dependency_direction',
          'A domain layer may not import `$target`. Dependencies point inward: '
              'data depends on domain, never the other way round.',
        );
        continue;
      }

      if ((zone.layer == 'domain' || zone.layer == 'data') &&
          targetZone.layer == 'presentation') {
        report(
          'dependency_direction',
          'A ${zone.layer} layer may not import `$target`. Presentation is the '
              'outermost layer and nothing beneath it may depend on it.',
        );
        continue;
      }

      if (zone.feature != null &&
          targetZone.feature != null &&
          targetZone.feature != zone.feature &&
          targetZone.layer == 'data') {
        report(
          'cross_feature_data',
          'Feature `${zone.feature}` may not import `$target`, the data layer of '
              'feature `${targetZone.feature}`. Promote the shared concept to a '
              'domain contract instead of coupling through an implementation.',
        );
        continue;
      }

      if (zone.feature != null && targetZone.isApp) {
        report(
          'dependency_direction',
          'Feature `${zone.feature}` may not import `$target`. The application '
              'layer wires features together; a feature does not reach back into '
              'it.',
        );
        continue;
      }

      // Nothing more specific applied, so fall back to the boundary of the zone
      // itself: a pure zone may only reach other pure zones.
      if (zone.isPure && !targetZone.isPure) {
        report(
          'pure_zone_isolation',
          '${zone.isCore ? 'The shared core' : 'A domain layer'} may not import '
              '`$target`, which is outside every pure zone.',
        );
      }
    }

    return violations;
  }

  bool _isAllowedPureExternal(String uri) => allowedPureExternalImports.any(
    (allowed) =>
        allowed.endsWith('/') ? uri.startsWith(allowed) : uri == allowed,
  );

  /// Turns an import URI into a repository-relative path, or `null` when it
  /// points outside this package.
  String? _resolve(String uri, {required String from}) {
    if (uri.startsWith('package:$packageName/')) {
      return 'lib/${uri.substring('package:$packageName/'.length)}';
    }
    if (uri.startsWith('package:') || uri.startsWith('dart:')) {
      return null;
    }
    final directory = from.contains('/')
        ? from.substring(0, from.lastIndexOf('/'))
        : '';
    return _normalize('$directory/$uri');
  }

  String _normalize(String path) {
    final parts = <String>[];
    for (final segment in path.split('/')) {
      if (segment.isEmpty || segment == '.') {
        continue;
      }
      if (segment == '..') {
        if (parts.isNotEmpty) {
          parts.removeLast();
        }
        continue;
      }
      parts.add(segment);
    }
    return parts.join('/');
  }

  String _relative(String path) {
    final prefix = root == '.' ? '' : '$root/';
    final normalized = path.startsWith('./') ? path.substring(2) : path;
    return normalized.startsWith(prefix)
        ? normalized.substring(prefix.length)
        : normalized;
  }

  static final RegExp _directivePattern = RegExp(
    r'''^\s*(?:import|export)\s+(?:'([^']+)'|"([^"]+)")''',
    multiLine: true,
  );

  Iterable<_Directive> _directivesIn(String source) sync* {
    final lines = source.split('\n');
    for (var index = 0; index < lines.length; index++) {
      final match = _directivePattern.firstMatch(lines[index]);
      if (match != null) {
        yield _Directive(match.group(1) ?? match.group(2)!, index + 1);
      }
    }
  }
}
