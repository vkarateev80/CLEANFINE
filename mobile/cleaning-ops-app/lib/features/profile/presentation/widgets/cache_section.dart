import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../services/cache_maintenance.dart';
import '../../../../services/sync_status.dart';
import '../../../../core/i18n/app_language.dart';

/// Раздел «Уведомления и данные» → размер кэша и «Очистить кэш планов и фото»
/// (DS-002 `profile.md` §3.5, `offline.md` §3).
///
/// Очистка не трогает очередь действий: пока в ней есть `pending`/`failed`,
/// кнопка недоступна (`profile.md` п. 11.7) — иначе оператор потерял бы аварийную
/// заявку или завершение операции.
class CacheSection extends ConsumerWidget {
  const CacheSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Считаем размер кэша **неблокирующе**: раздел рисуется всегда, а пока
    // цифры нет — на месте размера стоит «…». `cacheUsageProvider` ходит в
    // файловую систему (`path_provider`), и на платформенном канале, который не
    // отвечает, его `Future` не завершается никогда: если ждать его на
    // критическом пути отрисовки, экран профиля навсегда остаётся в загрузке
    // (та же ловушка, что с файловым кэшем плана в М6.7). Поэтому читаем только
    // `valueOrNull`, а состояния загрузки/ошибки — это просто «…».
    final AsyncValue<CacheUsage> usage = ref.watch(cacheUsageProvider);
    final CacheUsage? value = usage.valueOrNull;
    final int outgoing = ref.watch(outgoingCountProvider).valueOrNull ?? 0;

    return Card(
      key: const Key('profile_cache_section'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ListTile(
            key: const Key('profile_cache_size_tile'),
            leading: const Icon(Icons.sd_storage_outlined, color: AppPalette.textSecondary),
            title: Text(tr('Размер кэша'), style: const TextStyle(fontSize: AppTypography.sizeSM)),
            trailing: Text(
              value?.label ?? '…',
              key: const Key('profile_cache_size_text'),
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
          ),
          if (value?.isLow == true)
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
              child: Text(
                trArgs('Мало места: {mb} МБ. Очистите кэш.', <String, Object?>{'mb': value!.megabytes}),
                key: const Key('profile_cache_low_space_text'),
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.warningText),
              ),
            ),
          const Divider(height: 1),
          ListTile(
            key: const Key('profile_clear_cache_tile'),
            enabled: outgoing == 0,
            leading: const Icon(Icons.delete_outline, color: AppPalette.textSecondary),
            title: Text(
              tr('Очистить кэш планов и фото'),
              style: const TextStyle(fontSize: AppTypography.sizeSM),
            ),
            trailing: const Icon(Icons.chevron_right, color: AppPalette.textMuted),
            onTap: outgoing == 0 ? () => _confirmClear(context, ref) : null,
            subtitle: outgoing == 0
                ? null
                : Text(
                    tr('Очередь отправки не пуста — очистка недоступна'),
                    style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
                  ),
          ),
        ],
      ),
    );
  }

  /// Диалог подтверждения: «Очистить кэш? Планы и отправленные фото будут
  /// скачаны заново.» (текст дословно из `profile.md` §9).
  Future<void> _confirmClear(BuildContext context, WidgetRef ref) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        key: const Key('profile_clear_cache_dialog'),
        title: Text(tr('Очистить кэш? Планы и отправленные фото будут скачаны заново.')),
        actions: <Widget>[
          TextButton(
            key: const Key('profile_clear_cache_cancel'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(tr('Отмена')),
          ),
          FilledButton(
            key: const Key('profile_clear_cache_confirm'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(tr('Очистить')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    // Удаление файлов запускается только действием оператора — на критическом
    // пути отрисовки файловой системы по-прежнему нет.
    await ref.read(cacheMaintenanceProvider).clearCache();
    ref.invalidate(cacheUsageProvider);
  }
}
