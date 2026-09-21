import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../services/connectivity_service.dart';

/// Дословные тексты индикаторов оффлайна (DS-002 `offline.md` §2, §9).
///
/// У маршрута и чек-листа свои формулировки: их задают `route_map.md` §9 и
/// `checklist.md` §9 — они конкретнее общей таблицы `offline.md` §2
/// (расхождение зафиксировано в отчёте).
class OfflineIndicatorTexts {
  const OfflineIndicatorTexts._();

  static const String offline = 'Нет соединения — данные могут быть устаревшими';
  static const String route = 'Нет соединения — план из кэша, статусы сохранятся локально';
  static const String checklist = 'Нет соединения — результат сохранится и синхронизируется';

  /// «Данные от 14:32» — время последней записи кэша.
  static String cachedAt(String time) => 'Данные от $time';

  /// «Синхронизация: 2 из 5».
  static String syncing(int done, int total) => 'Синхронизация: $done из $total';
}

/// Оффлайн-баннер: «нет соединения» плюс время данных из кэша.
///
/// Показывается только когда сети нет (DS-002 §7: онлайн — баннера нет), поэтому
/// при онлайне в дереве не остаётся даже ключа. Ключ передаётся отдельным
/// параметром [bannerKey] — по спецификации он свой на каждом экране
/// (`today_offline_banner`, `route_offline_banner`, …).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({
    super.key,
    required this.bannerKey,
    this.lastUpdatedAt,
    this.message = OfflineIndicatorTexts.offline,
    this.visible,
  });

  final Key bannerKey;

  /// Текст баннера: по умолчанию — общий из `offline.md` §2.
  final String message;

  /// Время записи показанных данных. `null` — данные пришли из сети, второй
  /// строки «Данные от {HH:mm}» нет.
  final DateTime? lastUpdatedAt;

  /// Показать баннер принудительно, даже когда сеть есть.
  ///
  /// Нужно переписке (`chat.md` §3.4): её баннер говорит не про сеть, а про
  /// состояние WebSocket-соединения — «Нет соединения — сообщения уйдут при
  /// подключении». `null` — обычное правило по наличию сети.
  final bool? visible;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool online = ref.watch(onlineProvider).valueOrNull ?? true;
    if (!(visible ?? !online)) return const SizedBox.shrink();

    final DateTime? cachedAt = lastUpdatedAt;
    return Container(
      key: bannerKey,
      width: double.infinity,
      color: AppPalette.warning.withValues(alpha: 0.10),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.cloud_off_outlined, size: 18, color: AppPalette.warningText),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  message,
                  style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.warningText),
                ),
                if (cachedAt != null)
                  Text(
                    OfflineIndicatorTexts.cachedAt(formatCachedTime(cachedAt)),
                    style: const TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: AppPalette.warningText,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// «14:32» — время кэша в баннере (локальное время устройства).
String formatCachedTime(DateTime value) {
  final DateTime local = value.toLocal();
  final String hours = local.hour.toString().padLeft(2, '0');
  final String minutes = local.minute.toString().padLeft(2, '0');
  return '$hours:$minutes';
}
