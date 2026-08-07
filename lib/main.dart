import 'package:flutter/material.dart';

/// Entry point.
///
/// The application shell, its routing, and its dependency wiring arrive with
/// later slices of ENG-FND-0001. This placeholder exists so the project is
/// runnable on both targets from the first commit onwards.
void main() {
  runApp(const FamilyBeaconApp());
}

/// The root widget.
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
