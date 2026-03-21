import 'package:flutter_test/flutter_test.dart';
import 'package:yukika/main.dart';

void main() {
  testWidgets('SignIn page smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const YukikaApp());

    // Verify that our SignIn page is shown.
    expect(find.text('Welcome Back!'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
