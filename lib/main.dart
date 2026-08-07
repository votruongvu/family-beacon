import 'package:family_beacon/app/app.dart';
import 'package:family_beacon/app/bootstrap.dart';
import 'package:flutter/material.dart';

/// Entry point.
///
/// Deliberately thin: everything the application needs in order to start lives
/// in the application layer, so the entry point never becomes the place where
/// wiring accumulates.
Future<void> main() async {
  final result = await bootstrap();
  runApp(FamilyBeaconApp(config: result.config));
}
