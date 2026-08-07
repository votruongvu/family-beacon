import 'package:family_beacon/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('the application builds and renders its root', (tester) async {
    await tester.pumpWidget(const FamilyBeaconApp());

    expect(find.text('Family Beacon'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
