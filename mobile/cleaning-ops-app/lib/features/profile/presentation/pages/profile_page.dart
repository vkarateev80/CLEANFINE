import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/offline_banner.dart';
import '../../../../shared/widgets/sync_status_widgets.dart';
import '../../../auth/data/models/auth_user.dart';
import '../profile_texts.dart';
import '../providers/profile_providers.dart';
import '../widgets/cache_section.dart';
import '../widgets/gps_status_section.dart';
import '../widgets/notifications_sheet.dart';
import '../widgets/profile_card.dart';
import '../widgets/profile_sections.dart';

/// Профиль оператора `/profile` (М6.8, DS-002 `profile.md`).
///
/// Разделы: карточка пользователя, «Доступ» (PIN и пароль), «GPS-трекинг»
/// (М6.6), «Уведомления и данные» (подписки, очередь, кэш, «О приложении») и
/// выход. Ключи и тексты — дословно из §6 и §9 спецификации.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<AuthUser> profile = ref.watch(profileProvider);

    return Scaffold(
      key: const Key('profile_page'),
      appBar: AppBar(
        title: const Text(ProfileTexts.title),
        actions: const <Widget>[SyncStatusCounter(statusKey: Key('profile_sync_status'))],
      ),
      backgroundColor: AppPalette.background,
      body: Column(
        children: <Widget>[
          const OfflineBanner(bannerKey: Key('profile_offline_banner')),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: <Widget>[
                profile.when(
                  loading: () => const _ProfileSkeleton(),
                  error: (Object error, StackTrace stack) => _ProfileError(
                    failure: error is Failure ? error : const ServerFailure(),
                    onRetry: () => ref.invalidate(profileProvider),
                  ),
                  data: (AuthUser user) => ProfileCard(user: user),
                ),
                const SizedBox(height: AppSpacing.lg),
                const _SectionTitle(ProfileTexts.accessSection),
                const AccessSection(),
                const SizedBox(height: AppSpacing.lg),
                const GpsStatusSection(),
                const SizedBox(height: AppSpacing.lg),
                const _SectionTitle(ProfileTexts.dataSection),
                const NotificationsDataSection(),
                const SizedBox(height: AppSpacing.sm),
                const CacheSection(),
                const SizedBox(height: AppSpacing.lg),
                const LogoutSection(),
                const SizedBox(height: AppSpacing.lg),
                // Дев-кнопка: на стенде push отправляет `MockPushSender`, поэтому
                // весь путь уведомления проверяется без ключей Firebase
                // (`profile.md` §3.4). В release её нет — `kDebugMode`.
                if (testNotificationAvailable) const _TestNotificationButton(),
              ],
            ),
          ),
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

/// Скелетон карточки профиля (`profile.md` §5: `CircleAvatar` 64 + две строки).
class _ProfileSkeleton extends StatelessWidget {
  const _ProfileSkeleton();

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('profile_skeleton'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: <Widget>[
            Container(
              width: 64,
              height: 64,
              decoration:
                  const BoxDecoration(color: AppPalette.surfaceMuted, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Container(height: 16, color: AppPalette.surfaceMuted),
                  const SizedBox(height: AppSpacing.sm),
                  Container(height: 12, width: 140, color: AppPalette.surfaceMuted),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ошибка загрузки профиля: выход всё равно доступен (`profile.md` §5).
class _ProfileError extends StatelessWidget {
  const _ProfileError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('profile_error_card'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              ProfileTexts.profileLoadError,
              key: Key('profile_error_text'),
              style: TextStyle(fontSize: AppTypography.sizeBASE, color: AppPalette.dangerText),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              failure.message,
              style: const TextStyle(
                fontSize: AppTypography.sizeXS,
                color: AppPalette.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(
              key: const Key('profile_retry_button'),
              onPressed: onRetry,
              child: const Text(ProfileTexts.retry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Dev-кнопка «Показать тестовое уведомление»: открывает шторку подписок, где
/// видно, что канал уведомлений жив (на стенде — `MockPushSender`).
class _TestNotificationButton extends StatelessWidget {
  const _TestNotificationButton();

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      key: const Key('profile_test_notification_button'),
      onPressed: () => showNotificationsSheet(context),
      icon: const Icon(Icons.notifications_active_outlined, size: 18),
      label: const Text(ProfileTexts.testNotification),
    );
  }
}
