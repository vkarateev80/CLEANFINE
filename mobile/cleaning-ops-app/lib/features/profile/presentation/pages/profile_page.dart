import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../widgets/gps_status_section.dart';

/// Профиль оператора: доступ и GPS-трекинг (М6.6), остальные разделы — М6.8.
/// Ключи и тексты — по `design/screens/mobile/profile.md`.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('profile_page'),
      appBar: AppBar(title: const Text('Профиль')),
      backgroundColor: AppPalette.background,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: const <Widget>[
          GpsStatusSection(),
          SizedBox(height: AppSpacing.lg),
          _SectionTitle('Доступ'),
          _Placeholder(rows: <String>['Вход по PIN', 'Смена PIN', 'Выход из аккаунта']),
          SizedBox(height: AppSpacing.lg),
          _SectionTitle('Уведомления и данные'),
          _Placeholder(rows: <String>['Подписки на уведомления', 'Размер кэша', 'Очистить кэш']),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: AppSpacing.xs, bottom: AppSpacing.sm),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: AppTypography.sizeXS,
          fontWeight: FontWeight.w600,
          color: AppPalette.textSecondary,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

/// Раздел, который появится в М6.8: показывает состав, но не притворяется готовым.
class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.rows});

  final List<String> rows;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('profile_placeholder_section'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (final String row in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.schedule, size: 16, color: AppPalette.textMuted),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        row,
                        style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
