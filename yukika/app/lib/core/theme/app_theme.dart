import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color primary = Color(0xFF005DA6);
  static const Color primaryContainer = Color(0xFF54A3FF);
  static const Color background = Color(0xFFF5F7F9);
  static const Color surface = Color(0xFFF5F7F9);
  static const Color surfaceContainerLow = Color(0xFFEEF1F3);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color onSurface = Color(0xFF2C2F31);
  static const Color secondary = Color(0xFF4555A8);
  static const Color tertiaryContainer = Color(0xFFDEF5F8);
  static const Color onTertiaryContainer = Color(0xFF495E60);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        primary: primary,
        secondary: secondary,
        surface: surface,
        onSurface: onSurface,
      ),
      scaffoldBackgroundColor: background,
      textTheme: GoogleFonts.beVietnamProTextTheme().copyWith(
        displayLarge: GoogleFonts.plusJakartaSans(
          fontSize: 57,
          fontWeight: FontWeight.bold,
          color: onSurface,
        ),
        displayMedium: GoogleFonts.plusJakartaSans(
          fontSize: 45,
          fontWeight: FontWeight.bold,
          color: onSurface,
        ),
        headlineLarge: GoogleFonts.plusJakartaSans(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: onSurface,
        ),
        headlineMedium: GoogleFonts.plusJakartaSans(
          fontSize: 28,
          fontWeight: FontWeight.bold,
          color: onSurface,
        ),
        titleLarge: GoogleFonts.plusJakartaSans(
          fontSize: 22,
          fontWeight: FontWeight.bold,
          color: onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        color: surfaceContainerLowest,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(32),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: const StadiumBorder(),
          textStyle: GoogleFonts.beVietnamPro(
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
      ),
    );
  }
}

// Extension to access custom colors
extension AppThemeColors on ThemeData {
  Color get surfaceContainerLow => AppTheme.surfaceContainerLow;
  Color get surfaceContainerLowest => AppTheme.surfaceContainerLowest;
}
