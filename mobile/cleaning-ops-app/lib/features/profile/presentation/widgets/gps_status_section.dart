import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../services/gps_tracking_service.dart';
import '../../../../shared/services/location_service.dart';
import '../../../../core/i18n/app_language.dart';

/// Блок «GPS-трекинг» в профиле (DS-002 `profile.md` §3.3).
///
/// Показывает разрешение, состояние трекинга, счётчики точек и время последней
/// отправки; кнопка ведёт в системные настройки приложения.
class GpsStatusSection extends ConsumerStatefulWidget {
  const GpsStatusSection({super.key});

  @override
  ConsumerState<GpsStatusSection> createState() => _GpsStatusSectionState();
}

class _GpsStatusSectionState extends ConsumerState<GpsStatusSection> {
  @override
  void initState() {
    super.initState();
    // Разрешение и буфер читаются из платформы — обновляем после первого кадра.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(gpsTrackerProvider.notifier).refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final GpsTrackingState gps = ref.watch(gpsTrackerProvider);
    final bool granted = gps.access?.isGranted ?? false;

    return Card(
      key: const Key('profile_gps_section'),
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
            Text(
              tr('GPS-трекинг'),
              style: const TextStyle(
                fontSize: AppTypography.sizeXS,
                fontWeight: FontWeight.w600,
                color: AppPalette.textSecondary,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: <Widget>[
                const Icon(Icons.location_on_outlined, color: AppPalette.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    tr('Местоположение'),
                    style: const TextStyle(fontSize: AppTypography.sizeBASE),
                  ),
                ),
                Text(
                  gps.access?.label ?? tr('Проверяем…'),
                  key: const Key('profile_gps_status_text'),
                  style: TextStyle(
                    fontSize: AppTypography.sizeSM,
                    color: granted ? AppPalette.successText : AppPalette.dangerText,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              _trackingText(gps),
              key: const Key('profile_gps_tracking_text'),
              style: TextStyle(
                fontSize: AppTypography.sizeSM,
                color: granted ? AppPalette.textPrimary : AppPalette.dangerText,
              ),
            ),
            if (gps.buffered > 0)
              Text(
                trArgs('в буфере {count}', <String, Object?>{'count': gps.buffered}),
                key: const Key('profile_gps_buffered_text'),
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
              ),
            if (gps.lastSentAt != null)
              Text(
                trArgs('Последняя отправка {time}', <String, Object?>{'time': _time(gps.lastSentAt!)}),
                key: const Key('profile_gps_last_sent_text'),
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
              ),
            if (gps.lastError != null)
              Text(
                trArgs('Ошибка отправки: {error}', <String, Object?>{'error': gps.lastError}),
                key: const Key('profile_gps_error_text'),
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.dangerText),
              ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              tr('Для отметки на смене нужен доступ к геолокации, для фонового трекинга — „Всегда“ (Android: „Разрешить всегда“).'),
              style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(
              key: const Key('profile_gps_settings_button'),
              onPressed: () => ref.read(locationServiceProvider).openSettings(),
              child: Text(tr('Открыть настройки')),
            ),
          ],
        ),
      ),
    );
  }

  /// «Трекинг включён · отправлено 5 точек», пауза и отказ в разрешении — отдельно.
  String _trackingText(GpsTrackingState gps) {
    if (!(gps.access?.isGranted ?? false)) return tr('Нет разрешения — трекинг не работает');
    if (gps.paused) return tr('Трекинг приостановлен (смена не открыта)');
    return trArgs('Трекинг включён · отправлено {count} {points}', <String, Object?>{'count': gps.sent, 'points': points(gps.sent)});
  }

  String _time(DateTime value) {
    final DateTime local = value.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}

/// «1 точка», «2 точки», «5 точек» — для счётчиков в интерфейсе.
String points(int count) {
  final int mod10 = count % 10;
  final int mod100 = count % 100;
  if (mod10 == 1 && mod100 != 11) return tr('точка');
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return tr('точки');
  return tr('точек');
}

/// Подпись статуса разрешения для тестов и других экранов.
String locationAccessLabel(LocationAccess access) => access.label;
