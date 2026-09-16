import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth_texts.dart';

/// Экран запуска: пока читаются токены из защищённого хранилища.
/// Владелец задачи — М6.2 (авторизация), `design/screens/mobile/auth.md` §7.
///
/// Роутер показывает его на время `SessionController.bootstrap()`
/// (`app_router.dart`, статус `SessionStatus.unknown`).
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      key: Key('splash_page'),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.cleaning_services_outlined, size: 64, color: Color(AppColors.primary600)),
            SizedBox(height: AppSpacing.lg),
            Text(
              AuthTexts.appTitle,
              style: TextStyle(
                fontFamily: AppTypography.fontSans,
                fontSize: AppTypography.size2XL,
                fontWeight: FontWeight.w600,
                color: Color(AppColors.primary600),
              ),
            ),
            SizedBox(height: AppSpacing.xl),
            CircularProgressIndicator(),
            SizedBox(height: AppSpacing.md),
            Text(
              AuthTexts.splashCheck,
              style: TextStyle(
                fontFamily: AppTypography.fontSans,
                fontSize: AppTypography.sizeSM,
                color: Color(AppColors.neutral500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
