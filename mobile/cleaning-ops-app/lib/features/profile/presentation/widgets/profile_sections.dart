import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../../../../services/sync_status.dart';
import '../profile_texts.dart';
import 'notifications_sheet.dart';
import '../providers/profile_providers.dart';

/// Секция «Доступ»: смена PIN и пароля (DS-002 `profile.md` §3.2, §6).
class AccessSection extends StatelessWidget {
  const AccessSection({super.key});

  @override
  Widget build(BuildContext context) {
    return _MenuCard(
      cardKey: const Key('profile_access_section'),
      children: <Widget>[
        ListTile(
          key: const Key('profile_change_pin_tile'),
          leading: const Icon(Icons.key_outlined, color: AppPalette.textStrong),
          title: const Text(ProfileTexts.changePin),
          trailing: const Icon(Icons.chevron_right, color: AppPalette.textMuted),
          onTap: () => context.push(AppRoutes.profilePin),
        ),
        const Divider(height: 1, color: AppPalette.border),
        ListTile(
          key: const Key('profile_change_password_tile'),
          leading: const Icon(Icons.lock_outline, color: AppPalette.textStrong),
          title: const Text(ProfileTexts.changePassword),
          trailing: const Icon(Icons.chevron_right, color: AppPalette.textMuted),
          onTap: () => context.push(AppRoutes.profilePassword),
        ),
      ],
    );
  }
}

/// Секция «Уведомления и данные»: подписки, очередь, «О приложении»
/// (`profile.md` §3.4, §3.5, §6).
class NotificationsDataSection extends ConsumerWidget {
  const NotificationsDataSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final int outgoing = ref.watch(outgoingCountProvider).valueOrNull ?? 0;

    return _MenuCard(
      cardKey: const Key('profile_data_section'),
      children: <Widget>[
        ListTile(
          key: const Key('profile_notifications_tile'),
          leading: const Icon(Icons.notifications_none, color: AppPalette.textStrong),
          title: const Text(ProfileTexts.notifications),
          trailing: const Icon(Icons.chevron_right, color: AppPalette.textMuted),
          onTap: () => showNotificationsSheet(context),
        ),
        const Divider(height: 1, color: AppPalette.border),
        ListTile(
          key: const Key('profile_queue_tile'),
          leading: const Icon(Icons.bolt_outlined, color: AppPalette.textStrong),
          title: const Text(ProfileTexts.queue),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (outgoing > 0)
                Text(
                  ProfileTexts.actions(outgoing),
                  key: const Key('profile_queue_count_text'),
                  style: const TextStyle(
                    fontSize: AppTypography.sizeSM,
                    color: AppPalette.textSecondary,
                  ),
                ),
              const SizedBox(width: AppSpacing.xs),
              const Icon(Icons.chevron_right, color: AppPalette.textMuted),
            ],
          ),
          onTap: () => context.push(AppRoutes.offline),
        ),
        const Divider(height: 1, color: AppPalette.border),
        ListTile(
          key: const Key('profile_about_tile'),
          leading: const Icon(Icons.info_outline, color: AppPalette.textStrong),
          title: const Text(ProfileTexts.about),
          subtitle: Text(
            ProfileTexts.version(AppConstants.version),
            key: const Key('profile_version_text'),
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
          ),
          onTap: () => _showAbout(context),
        ),
      ],
    );
  }

  void _showAbout(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        key: const Key('profile_about_dialog'),
        title: const Text(ProfileTexts.about),
        content: Text(ProfileTexts.version(AppConstants.version)),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Закрыть'),
          ),
        ],
      ),
    );
  }
}

/// Кнопка «Выйти» и её диалог (`profile.md` §4, §6).
class LogoutSection extends ConsumerWidget {
  const LogoutSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final LogoutState state = ref.watch(logoutControllerProvider);
    final int outgoing = ref.watch(outgoingCountProvider).valueOrNull ?? 0;

    return SizedBox(
      height: 48,
      child: OutlinedButton(
        key: const Key('profile_logout_button'),
        onPressed: state.inProgress ? null : () => _confirm(context, ref, outgoing),
        style: OutlinedButton.styleFrom(
          // Деструктивное действие — граница, а не заливка (`profile.md` §7).
          foregroundColor: AppPalette.dangerText,
          side: const BorderSide(color: AppPalette.dangerText),
          backgroundColor: Colors.white,
        ),
        child: state.inProgress
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Text(ProfileTexts.logout),
      ),
    );
  }

  Future<void> _confirm(BuildContext context, WidgetRef ref, int outgoing) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        key: const Key('profile_logout_dialog'),
        title: const Text(ProfileTexts.logoutDialogTitle),
        content: Text(ProfileTexts.logoutWarning(outgoing)),
        actions: <Widget>[
          TextButton(
            key: const Key('profile_logout_cancel_button'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(ProfileTexts.cancel),
          ),
          FilledButton(
            key: const Key('profile_logout_confirm_button'),
            style: FilledButton.styleFrom(
              backgroundColor: AppPalette.danger,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text(ProfileTexts.logout),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    // Локальная очистка идёт всегда: без сети выход тоже обязан работать
    // (`profile.md` §4). Роутер уводит на `/login` по смене сессии.
    await ref.read(logoutControllerProvider.notifier).logout();
  }
}

/// Карточка-меню: белый фон, скругление `lg`, разделители `neutral200`.
class _MenuCard extends StatelessWidget {
  const _MenuCard({required this.children, required this.cardKey});

  final List<Widget> children;
  final Key cardKey;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: cardKey,
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Column(children: children),
    );
  }
}
