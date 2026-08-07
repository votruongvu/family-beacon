import 'package:family_beacon/app/app.dart';
import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('the application builds and renders its root', (tester) async {
    await tester.pumpWidget(
      FamilyBeaconApp(
        config: AppConfig.forEnvironment(AppEnvironment.development),
      ),
    );

    expect(find.text('Family Beacon'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the build says which environment it is talking to', (
    tester,
  ) async {
    await tester.pumpWidget(
      FamilyBeaconApp(config: AppConfig.forEnvironment(AppEnvironment.staging)),
    );

    expect(find.textContaining('environment=staging'), findsOneWidget);
    expect(find.textContaining('project=family-beacon-stg'), findsOneWidget);
  });
}
