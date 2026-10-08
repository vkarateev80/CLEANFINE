import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../database/app_cache.dart';
import '../database/database_provider.dart';
import '../features/auth/presentation/providers/session_provider.dart';
import 'sync_service.dart';

/// Наблюдаемый прогресс синхронизации очереди (DS-002 `offline.md` §2, §7).
///
/// «Синхронизировать сейчас» на `/offline` и любой другой проход очереди идут
/// через этот контроллер, поэтому индикатор «Синхронизация: {done} из {total}»
/// виден и на маршруте, и в чек-листе, а не только на экране очереди.
class SyncStatusController extends Notifier<SyncProgress> {
  @override
  SyncProgress build() {
    ref.watch(sessionScopeProvider);
    return const SyncProgress.idle();
  }

  /// Один проход очереди с публикацией прогресса после каждой записи.
  Future<SyncProgress> runOnce() async {
    final int total = await ref.read(pendingActionQueueProvider).pendingCount();
    state = SyncProgress(done: 0, failed: 0, total: total, running: total > 0);
    try {
      final SyncProgress progress = await ref
          .read(syncServiceProvider)
          .runOnce(onProgress: (SyncProgress value) => state = value);
      state = progress;
      return progress;
    } on Object {
      // Ошибка прохода не должна оставлять экран в состоянии «синхронизация идёт».
      state = const SyncProgress.idle();
      rethrow;
    }
  }
}

final syncStatusProvider = NotifierProvider<SyncStatusController, SyncProgress>(
  SyncStatusController.new,
);

/// Счётчик неотправленного для `AppBar` (DS-002 §2): живой запрос к drift,
/// поэтому число меняется сразу после того, как синхронизация закрыла запись.
final outgoingCountProvider = StreamProvider<int>((Ref ref) {
  return ref.watch(appDatabaseProvider).watchOutgoingCount();
});
