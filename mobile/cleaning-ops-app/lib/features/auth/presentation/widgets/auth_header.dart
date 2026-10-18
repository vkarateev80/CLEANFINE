import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth_texts.dart';

/// Шапка экранов входа: текстовый логотип и подпись.
///
/// `auth.md` §4.1: отдельного ассета логотипа нет — «🧹 CLEANFINE»
/// (`size2XL`/600/`primary600`) и «Приложение оператора» (`sizeSM`/`neutral500`).
class AuthHeader extends StatelessWidget {
  /// `title`/`subtitle` по умолчанию — «🧹 CLEANFINE» / «Приложение оператора»
  /// на языке интерфейса; `subtitle: ''` скрывает подпись.
  const AuthHeader({super.key, this.title, this.subtitle});

  final String? title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final String title = this.title ?? AuthTexts.appTitle;
    final String subtitle = this.subtitle ?? AuthTexts.appSubtitle;
    return Column(
      children: <Widget>[
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: AppTypography.fontSans,
            fontSize: AppTypography.size2XL,
            fontWeight: FontWeight.w600,
            color: Color(AppColors.primary600),
          ),
        ),
        if (subtitle.isNotEmpty) ...<Widget>[
          const SizedBox(height: AppSpacing.xs),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: AppTypography.fontSans,
              fontSize: AppTypography.sizeSM,
              color: Color(AppColors.neutral500),
            ),
          ),
        ],
      ],
    );
  }
}
