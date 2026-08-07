/// The application layer: what wires the parts together.
///
/// This layer knows about features; features do not know about it. Bootstrap,
/// configuration, dependency resolution, and routing live here, and the
/// architecture check enforces the direction.
library;

import 'package:family_beacon/app/router/app_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The root widget.
class FamilyBeaconApp extends ConsumerWidget {
  /// Creates the root widget.
  const FamilyBeaconApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Family Beacon',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1B6C4F)),
      ),
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
