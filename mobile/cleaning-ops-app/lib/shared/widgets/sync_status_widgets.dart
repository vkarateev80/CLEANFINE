import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../router/app_router.dart';
import '../../services/sync_service.dart';
import '../../services/sync_status.dart';
import 'offline_banner.dart';

/// Счётчик неотправленного в `AppBar` (DS-002 `offline.md` §2).
///
/// Иконка `Icons.sync_problem` и число записей `pending` + `sending` + `failed`;
/// при нуле в дереве не остаётся ничего, включая ключ. Тап открывает `/offline`.
class SyncStatusCounter extends ConsumerWidget {
  const SyncStatusCounter({super.key, required this.statusKey});

  final Key statusKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final int count = ref.watch(outgoingCountProvider).valueOrNull ?? 0;
    if (count == 0) return const SizedBox.shrink();

    return TextButton.icon(
      key: statusKey,
      onPressed: () => context.push(AppRoutes.offline),
      style: TextButton.styleFrom(foregroundColor: AppPalette.warningText),
      icon: const Icon(Icons.sync_problem, size: 18),
      label: Text(
        '$count',
        style: const TextStyle(fontSize: AppTypography.sizeSM, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// «Синхронизация: {done} из {total}» в `AppBar` маршрута и чек-листа (DS-002 §2).
///
/// Показывается только во время прохода очереди: вне синхронизации ключа в дереве
/// нет, как и у баннера.
class SyncProgressIndicator extends ConsumerWidget {
  const SyncProgressIndicator({super.key, required this.statusKey});

  final Key statusKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SyncProgress progress = ref.watch(syncStatusProvider);
    if (!progress.running) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: LinearProgressIndicator(
              value: progress.total == 0 ? null : progress.processed / progress.total,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            OfflineIndicatorTexts.syncing(progress.processed, progress.total),
            key: statusKey,
            style: const TextStyle(fontSize: AppTypography.sizeXS),
          ),
        ],
      ),
    );
  }
}

/// Высота полосы синхронизации под `AppBar`: её требует `PreferredSizeWidget`.
class SyncProgressBar extends StatelessWidget implements PreferredSizeWidget {
  const SyncProgressBar({super.key, required this.statusKey});

  final Key statusKey;

  @override
  Size get preferredSize => const Size.fromHeight(28);

  @override
  Widget build(BuildContext context) => SyncProgressIndicator(statusKey: statusKey);
}
