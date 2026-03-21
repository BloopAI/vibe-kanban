import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'firebase_options.dart';
import 'dart:async';

void main() async {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
    } catch (e) {
      debugPrint("Firebase initialization error: $e");
    }

    runApp(const YukikaApp());
  }, (error, stack) {
    debugPrint("Uncaught error: $error");
  });
}

class YukikaApp extends StatelessWidget {
  const YukikaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Yukika',
      theme: AppTheme.lightTheme,
      routerConfig: appRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}
