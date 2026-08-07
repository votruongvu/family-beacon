/// Fails the build when the dependency rules of ENG-FND-0001 are broken.
///
/// Run it directly, or through the project's verification entry point:
///
/// ```sh
/// dart run tool/check_architecture.dart
/// ```
library;

import 'dart:io';

import 'architecture/architecture_rules.dart';

void main(List<String> arguments) {
  final root = arguments.isEmpty ? '.' : arguments.first;
  final violations = ArchitectureCheck(root: root).run();

  if (violations.isEmpty) {
    stdout.writeln('Architecture check passed: dependencies point inward.');
    return;
  }

  stderr.writeln(
    'Architecture check failed with ${violations.length} violation(s):',
  );
  stderr.writeln();
  for (final violation in violations) {
    stderr.writeln('  $violation');
  }
  stderr.writeln();
  stderr.writeln('These rules come from the Shared Contract of ENG-FND-0001.');
  exitCode = 1;
}
