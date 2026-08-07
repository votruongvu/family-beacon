/// The application layer: what wires the parts together.
///
/// This layer knows about features; features do not know about it. Bootstrap,
/// configuration, and routing live here, and the architecture check enforces
/// the direction.
library;

import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:flutter/material.dart';

/// The root widget.
///
/// Routing, dependency wiring, and the real shell arrive with later slices of
/// ENG-FND-0001.
class FamilyBeaconApp extends StatelessWidget {
  /// Creates the root widget for [config].
  const FamilyBeaconApp({required this.config, super.key});

  /// What this build is pointing at.
  final AppConfig config;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Family Beacon${config.environment.displaySuffix}',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1B6C4F)),
      ),
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              const Text('Family Beacon'),
              // Which deployment a build is talking to has to be obvious while
              // three of them can sit on one device. This is a placeholder
              // surface; the real shell replaces it, but the fact stays visible.
              Text(config.describe()),
            ],
          ),
        ),
      ),
    );
  }
}
