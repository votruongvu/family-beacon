/// The application layer: what wires the parts together.
///
/// This layer knows about features; features do not know about it. Bootstrap,
/// configuration, and routing live here, and the architecture check enforces
/// the direction.
library;

import 'package:flutter/material.dart';

/// The root widget.
///
/// Routing, dependency wiring, and the real shell arrive with later slices of
/// ENG-FND-0001.
class FamilyBeaconApp extends StatelessWidget {
  /// Creates the root widget.
  const FamilyBeaconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Family Beacon',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1B6C4F)),
      ),
      home: const Scaffold(body: Center(child: Text('Family Beacon'))),
    );
  }
}
