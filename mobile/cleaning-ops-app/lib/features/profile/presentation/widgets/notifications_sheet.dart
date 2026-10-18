import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../data/models/notification_models.dart';
import '../profile_texts.dart';
import '../providers/profile_providers.dart';

/// Шторка «Уведомления» (DS-002 `profile.md` §2, §3.4, §6).
///
/// Тумблеры рисуются по `availableTypes`, выключенный означает, что тип лежит в
/// `disabledTypes` (семантика сервера инвертирована относительно UI).
/// Сохранение — `PATCH /api/notifications/settings {disabledTypes}`.
Future<void> showNotificationsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (BuildContext sheetContext) => const _NotificationsSheet(),
  );
}

class _NotificationsSheet extends ConsumerStatefulWidget {
  const _NotificationsSheet();

  @override
  ConsumerState<_NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends ConsumerState<_NotificationsSheet> {
  /// Локальная копия настроек: тумблеры меняются до нажатия «Сохранить».
  NotificationSettings? _draft;
  bool _saving = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<NotificationSettings> async = ref.watch(notificationSettingsProvider);
    final NotificationSettings? settings = _draft ?? async.valueOrNull;

    return SafeArea(
      key: const Key('profile_notifications_sheet'),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppPalette.border,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              ProfileTexts.notifications,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.md),
            if (settings == null)
              _placeholder(async)
            else
              ..._switches(settings),
            if (_error != null) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              Text(
                _error!,
                key: const Key('profile_notifications_error_text'),
                style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              key: const Key('profile_notifications_save_button'),
              onPressed: settings == null || _saving ? null : () => _save(settings),
              child: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(ProfileTexts.save),
            ),
          ],
        ),
      ),
    );
  }

  /// Ошибка загрузки настроек: баннер и «Повторить» (`profile.md` §5).
  Widget _placeholder(AsyncValue<NotificationSettings> async) {
    if (async.isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          ProfileTexts.settingsLoadError,
          key: const Key('profile_notifications_load_error_text'),
          style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
        ),
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton(
          key: const Key('profile_notifications_retry_button'),
          onPressed: () => ref.invalidate(notificationSettingsProvider),
          child: Text(ProfileTexts.retry),
        ),
      ],
    );
  }

  List<Widget> _switches(NotificationSettings settings) {
    return <Widget>[
      for (final String type in settings.orderedTypes)
        SwitchListTile(
          key: Key('profile_notification_switch_$type'),
          value: settings.isEnabled(type),
          title: Text(
            NotificationTypes.label(type),
            style: const TextStyle(fontSize: AppTypography.sizeBASE),
          ),
          onChanged: (bool value) =>
              setState(() => _draft = settings.withEnabled(type, value)),
        ),
    ];
  }

  Future<void> _save(NotificationSettings settings) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final String? error = await ref.read(notificationSettingsProvider.notifier).save(settings);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _error = error;
    });
    if (error == null) {
      _draft = null;
      if (mounted) Navigator.of(context).pop();
    }
  }
}
