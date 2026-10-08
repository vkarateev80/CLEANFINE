import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../database/database_provider.dart';
import '../../../../services/sync_service.dart';
import '../../../../shared/data/pending_actions.dart';
import '../../../auth/presentation/providers/session_provider.dart';

/// Состояние экрана очереди `/offline`.
class OfflineState {
  const OfflineState({
    required this.actions,
    this.progress = const SyncProgress.idle(),
    this.syncing = false,
    this.error,
  });

  final List<PendingAction> actions;

  /// Итог последнего прохода очереди: «Отправлено {done} из {total}».
  final SyncProgress progress;
  final bool syncing;
  final String? error;

  /// Записи, которые ещё не ушли на сервер.
  int get outgoing => actions.where((PendingAction action) => action.isOutgoing).length;

  bool get isEmpty => actions.isEmpty;

  OfflineState copyWith({
    List<PendingAction>? actions,
    SyncProgress? progress,
    bool? syncing,
    String? error,
    bool clearError = false,
  }) {
    return OfflineState(
      actions: actions ?? this.actions,
      progress: progress ?? this.progress,
      syncing: syncing ?? this.syncing,
      error: clearError ? null : error ?? this.error,
    );
  }
}

/// Очередь действий и её синхронизация (М6.7).
class OfflineController extends AsyncNotifier<OfflineState> {
  @override
  Future<OfflineState> build() {
    // Данные пользователя: выход и вход другого пересобирают провайдер с нуля.
    ref.watch(sessionScopeProvider);
    return _load();
  }

  Future<OfflineState> _load({SyncProgress? progress, bool? syncing}) async {
    final PendingActionQueue queue = ref.read(pendingActionQueueProvider);
    return OfflineState(
      actions: await queue.all(),
      progress: progress ?? const SyncProgress.idle(),
      syncing: syncing ?? false,
    );
  }

  Future<void> refresh() async {
    final OfflineState? current = state.valueOrNull;
    state = AsyncData<OfflineState>(
      await _load(progress: current?.progress, syncing: current?.syncing),
    );
  }

  /// «Синхронизировать сейчас»: один проход очереди (DS-002 §6).
  Future<void> syncNow() async {
    final OfflineState? current = state.valueOrNull;
    if (current == null || current.syncing) return;

    state = AsyncData<OfflineState>(current.copyWith(syncing: true, clearError: true));
    try {
      final SyncProgress progress = await ref.read(syncServiceProvider).runOnce();
      state = AsyncData<OfflineState>(
        await _load(progress: progress, syncing: false),
      );
    } on Object catch (error) {
      final OfflineState latest = state.valueOrNull ?? current;
      state = AsyncData<OfflineState>(
        latest.copyWith(syncing: false, error: error.toString()),
      );
    }
  }

  /// Ручной повтор записи: счётчик попыток не сбрасывается, отправка — сейчас.
  Future<void> retry(String id) async {
    await ref.read(pendingActionQueueProvider).retryNow(id);
    await refresh();
  }

  /// Удаление записи: действие не будет отправлено (DS-002 §6).
  Future<void> remove(String id) async {
    await ref.read(pendingActionQueueProvider).remove(id);
    await refresh();
  }
}

final offlineProvider = AsyncNotifierProvider<OfflineController, OfflineState>(
  OfflineController.new,
);
