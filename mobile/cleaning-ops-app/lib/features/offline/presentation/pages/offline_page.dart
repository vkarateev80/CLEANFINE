import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/clock.dart';
import '../../../../services/connectivity_service.dart';
import '../../../../shared/data/pending_actions.dart';
import '../offline_texts.dart';
import '../providers/offline_providers.dart';
import '../../../../core/i18n/app_language.dart';

/// Экран очереди `/offline` (М6.7): что не ушло на сервер, почему и когда уйдёт.
/// Ключи и тексты — по `design/screens/mobile/offline.md` §2, §6, §9.
class OfflinePage extends ConsumerWidget {
  const OfflinePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<OfflineState> async = ref.watch(offlineProvider);
    final bool online = ref.watch(onlineProvider).valueOrNull ?? true;

    return Scaffold(
      key: const Key('offline_page'),
      appBar: AppBar(title: Text(OfflineTexts.title)),
      backgroundColor: AppPalette.background,
      body: async.when(
        loading: () => const _Skeleton(),
        error: (Object error, StackTrace stack) => _LoadError(
          message: error is Failure ? tr(error.message) : OfflineTexts.loadFailed,
          onRetry: () => ref.invalidate(offlineProvider),
        ),
        data: (OfflineState state) => _content(context, ref, state, online),
      ),
    );
  }

  Widget _content(BuildContext context, WidgetRef ref, OfflineState state, bool online) {
    final OfflineController controller = ref.read(offlineProvider.notifier);
    final int retrying = state.outgoing;

    return Column(
      children: <Widget>[
        _StatusBanner(online: online, outgoing: retrying),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                OfflineTexts.progress(state.progress.done, state.progress.total),
                key: const Key('offline_progress_text'),
                style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  key: const Key('offline_sync_now_button'),
                  onPressed: state.syncing ? null : controller.syncNow,
                  icon: state.syncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.sync),
                  label: Text(OfflineTexts.syncNow),
                ),
              ),
              if (state.error != null) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  state.error!,
                  key: const Key('offline_error_text'),
                  style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: state.isEmpty
              ? const _EmptyQueue()
              : ListView.builder(
                  key: const Key('offline_queue_list'),
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  itemCount: state.actions.length,
                  itemBuilder: (BuildContext context, int index) {
                    final PendingAction action = state.actions[index];
                    return _QueueItem(
                      action: action,
                      now: ref.read(nowProvider)(),
                      onRetry: () => controller.retry(action.id),
                      onDelete: () => _confirmDelete(context, controller, action),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    OfflineController controller,
    PendingAction action,
  ) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(OfflineTexts.deleteTitle),
        actions: <Widget>[
          TextButton(
            key: Key('offline_delete_cancel_${action.id}'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(OfflineTexts.cancel),
          ),
          FilledButton(
            key: Key('offline_delete_confirm_${action.id}'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(OfflineTexts.delete),
          ),
        ],
      ),
    );
    if (confirmed == true) await controller.remove(action.id);
  }
}

/// Баннер состояния: есть ли соединение и сколько действий ждёт отправки.
class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.online, required this.outgoing});

  final bool online;
  final int outgoing;

  @override
  Widget build(BuildContext context) {
    final Color color = online ? AppPalette.successText : AppPalette.warningText;
    final IconData icon = online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined;
    final String text = online ? OfflineTexts.onlineReady : OfflineTexts.offlineStatus(outgoing);

    return Container(
      key: const Key('offline_status_banner'),
      width: double.infinity,
      color: color.withValues(alpha: 0.08),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18, color: color),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: AppTypography.sizeSM, color: color)),
          ),
        ],
      ),
    );
  }
}

/// Строка очереди: вид действия, статус, причина ошибки и кнопки.
class _QueueItem extends StatelessWidget {
  const _QueueItem({
    required this.action,
    required this.now,
    required this.onRetry,
    required this.onDelete,
  });

  final PendingAction action;
  final DateTime now;
  final VoidCallback onRetry;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final int? retryIn = offlineSecondsToRetry(action.nextAttemptAt, now);
    final bool failed = action.status == PendingActionStatus.failed;

    return Card(
      key: Key('offline_item_${action.id}'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: BorderSide(color: failed ? AppPalette.danger : AppPalette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(_icon, size: 18, color: _iconColor),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    OfflineTexts.kind(action),
                    style: const TextStyle(
                      fontSize: AppTypography.sizeBASE,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                Text(
                  action.status.label,
                  style: TextStyle(
                    fontSize: AppTypography.sizeXS,
                    color: failed ? AppPalette.dangerText : AppPalette.successText,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${OfflineTexts.created(offlineTime(action.createdAt))}'
              '${action.attempts > 0 ? ' · ${OfflineTexts.attempts(action.attempts)}' : ''}'
              '${retryIn != null ? ' · ${OfflineTexts.retryIn(retryIn)}' : ''}',
              style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
            ),
            if (action.lastError != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  OfflineTexts.failed(action.lastError!),
                  key: Key('offline_item_error_${action.id}'),
                  style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.dangerText),
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: <Widget>[
                OutlinedButton(
                  key: Key('offline_item_retry_${action.id}'),
                  onPressed: onRetry,
                  child: Text(OfflineTexts.retry),
                ),
                const SizedBox(width: AppSpacing.sm),
                TextButton(
                  key: Key('offline_item_delete_${action.id}'),
                  onPressed: onDelete,
                  child: Text(OfflineTexts.delete),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData get _icon => switch (action.type) {
        PendingActionTypes.sos => Icons.warning_amber,
        PendingActionTypes.sosAttachPhoto => Icons.photo_camera_back_outlined,
        PendingActionTypes.operationCompleted => Icons.check_circle_outline,
        _ => Icons.sync_problem,
      };

  Color get _iconColor => switch (action.status) {
        PendingActionStatus.synced => AppPalette.success,
        PendingActionStatus.failed => AppPalette.danger,
        _ => AppPalette.warning,
      };
}

/// Очередь пуста: всё ушло на сервер.
class _EmptyQueue extends StatelessWidget {
  const _EmptyQueue();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          key: const Key('offline_empty'),
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_done_outlined, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            Text(
              OfflineTexts.empty,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

/// Скелетоны строк, пока очередь читается из базы.
class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: <Widget>[
        for (int i = 0; i < 2; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Container(
              height: 96,
              decoration: BoxDecoration(
                color: AppPalette.border,
                borderRadius: BorderRadius.circular(AppRadius.lg),
              ),
            ),
          ),
      ],
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.error_outline, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            Text(
              OfflineTexts.loadFailed,
              key: const Key('offline_error_text'),
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(
              key: const Key('offline_error_retry'),
              onPressed: onRetry,
              child: Text(OfflineTexts.retry),
            ),
          ],
        ),
      ),
    );
  }
}
