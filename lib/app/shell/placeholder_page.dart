/// A destination that exists so the shell is navigable before any product
/// capability has been built.
library;

import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/di/app_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A minimal page carrying a title and an explanation.
///
/// These are replaced by real screens as Requirements are implemented, and the
/// visual language they eventually use is a UX Foundation decision, not one
/// taken here.
class PlaceholderPage extends ConsumerWidget {
  /// Creates a placeholder destination.
  const PlaceholderPage({
    required this.title,
    required this.message,
    super.key,
  });

  /// What this destination is called.
  final String title;

  /// Why there is nothing here yet.
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppConfig config = ref.watch(appConfigProvider);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            // Which deployment a build talks to has to be obvious while three of
            // them can sit on one device at once.
            Text(
              config.describe(),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
