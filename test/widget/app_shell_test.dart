import 'package:family_beacon/app/app.dart';
import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:family_beacon/app/di/app_providers.dart';
import 'package:family_beacon/app/router/access_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pumpApp(
  WidgetTester tester, {
  AccessState access = AccessState.signedOut,
  AppEnvironment environment = AppEnvironment.development,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(
          AppConfig.forEnvironment(environment),
        ),
        accessStateProvider.overrideWithValue(access),
      ],
      child: const FamilyBeaconApp(),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the application starts without throwing', (tester) async {
    await _pumpApp(tester);

    expect(tester.takeException(), isNull);
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  testWidgets('a signed-out person lands on the public destination', (
    tester,
  ) async {
    await _pumpApp(tester);

    expect(find.text('Welcome'), findsOneWidget);
  });

  testWidgets('a signed-in person lands on the guarded destination', (
    tester,
  ) async {
    await _pumpApp(tester, access: AccessState.signedIn);

    expect(find.text('Family Beacon'), findsOneWidget);
    expect(find.text('Welcome'), findsNothing);
  });

  testWidgets('the shell says which environment the build is talking to', (
    tester,
  ) async {
    await _pumpApp(tester, environment: AppEnvironment.staging);

    expect(find.textContaining('environment=staging'), findsOneWidget);
    expect(find.textContaining('project=family-beacon-stg'), findsOneWidget);
  });

  testWidgets('the configuration provider refuses to invent a default', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: FamilyBeaconApp()));
    await tester.pump();

    expect(
      tester.takeException().toString(),
      contains('appConfigProvider must be overridden'),
      reason:
          'silently inventing a configuration would mean silently choosing an environment',
    );
  });
}
