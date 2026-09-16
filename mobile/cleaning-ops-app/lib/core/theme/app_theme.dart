import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Тема приложения: Material 3 поверх дизайн-токенов DS-001.
///
/// Шрифт Inter в сборку пока не включён (нет файлов шрифта в репозитории) —
/// используется системный; это зафиксировано в `mobile/README.md`.
class AppTheme {
  const AppTheme._();

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppPalette.primary,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppPalette.primary,
      error: AppPalette.danger,
      surface: AppPalette.surface,
    );

    final base = ThemeData(useMaterial3: true, colorScheme: scheme);

    return base.copyWith(
      scaffoldBackgroundColor: AppPalette.background,
      textTheme: base.textTheme.apply(
        fontFamily: AppTypography.fontSans,
        bodyColor: AppPalette.textPrimary,
        displayColor: AppPalette.textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppPalette.surface,
        foregroundColor: AppPalette.textPrimary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: AppTypography.fontSans,
          fontSize: AppTypography.sizeLG,
          fontWeight: FontWeight.w600,
          color: AppPalette.textPrimary,
        ),
      ),
      cardTheme: CardTheme(
        color: AppPalette.surface,
        elevation: 1,
        margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.sm,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppPalette.border,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppPalette.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.danger, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppPalette.primary,
          foregroundColor: AppPalette.textOnPrimary,
          minimumSize: const Size.fromHeight(52),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          textStyle: const TextStyle(
            fontFamily: AppTypography.fontSans,
            fontSize: AppTypography.sizeBASE,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppPalette.primary,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: AppPalette.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppPalette.textPrimary,
        contentTextStyle: TextStyle(
          fontFamily: AppTypography.fontSans,
          color: AppPalette.surface,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppPalette.surface,
        indicatorColor: AppPalette.primaryLight,
        labelTextStyle: MaterialStateProperty.all(
          const TextStyle(
            fontFamily: AppTypography.fontSans,
            fontSize: AppTypography.sizeXS,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppPalette.primary),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        iconColor: AppPalette.textSecondary,
      ),
    );
  }
}
