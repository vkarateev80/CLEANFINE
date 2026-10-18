import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_colors.dart';
import 'app_language.dart';
import 'language_provider.dart';

/// Сегменты «RU · KY · UZ» — на экранах входа, до авторизации.
class LanguageSegments extends ConsumerWidget {
  const LanguageSegments({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLanguage current = ref.watch(languageProvider);
    return SegmentedButton<AppLanguage>(
      key: const Key('language_segments'),
      showSelectedIcon: false,
      style: const ButtonStyle(
        visualDensity: VisualDensity.compact,
        textStyle: WidgetStatePropertyAll<TextStyle>(
          TextStyle(fontSize: AppTypography.sizeSM, fontWeight: FontWeight.w600),
        ),
      ),
      segments: <ButtonSegment<AppLanguage>>[
        for (final AppLanguage language in AppLanguage.values)
          ButtonSegment<AppLanguage>(
            value: language,
            label: Text(language.short, key: Key('language_segment_${language.code}')),
            tooltip: language.nativeName,
          ),
      ],
      selected: <AppLanguage>{current},
      onSelectionChanged: (Set<AppLanguage> selection) =>
          ref.read(languageProvider.notifier).select(selection.first),
    );
  }
}

/// Пункт «Язык» в профиле: показывает текущий язык, по тапу — лист выбора.
class LanguageTile extends ConsumerWidget {
  const LanguageTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLanguage current = ref.watch(languageProvider);
    return ListTile(
      key: const Key('profile_language_tile'),
      leading: const Icon(Icons.language, color: AppPalette.textStrong),
      title: Text(tr('Язык')),
      subtitle: Text(
        current.nativeName,
        key: const Key('profile_language_value'),
        style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
      ),
      trailing: const Icon(Icons.chevron_right, color: AppPalette.textMuted),
      onTap: () => showLanguageSheet(context),
    );
  }
}

/// Нижний лист с тремя языками; выбор применяется сразу.
Future<void> showLanguageSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (BuildContext sheetContext) => Consumer(
      builder: (BuildContext context, WidgetRef ref, _) {
        final AppLanguage current = ref.watch(languageProvider);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.sm),
                child: Text(
                  tr('Язык интерфейса'),
                  style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
                ),
              ),
              RadioGroup<AppLanguage>(
                groupValue: current,
                onChanged: (AppLanguage? value) {
                  if (value == null) return;
                  ref.read(languageProvider.notifier).select(value);
                  Navigator.of(sheetContext).pop();
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    for (final AppLanguage language in AppLanguage.values)
                      RadioListTile<AppLanguage>(
                        key: Key('language_option_${language.code}'),
                        value: language,
                        title: Text(language.nativeName),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ),
        );
      },
    ),
  );
}
