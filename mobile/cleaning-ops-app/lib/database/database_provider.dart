import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/data/pending_actions.dart';
import 'app_database.dart';
import 'drift_pending_action_queue.dart';

/// Локальная база приложения (drift). Одна на процесс, закрывается вместе с ним.
final appDatabaseProvider = Provider<AppDatabase>((Ref ref) {
  final AppDatabase database = AppDatabase(openAppDatabaseConnection());
  ref.onDispose(database.close);
  return database;
});

/// Очередь действий оператора: рабочая реализация — в drift, поэтому неотправленные
/// завершения операций и SOS переживают перезапуск приложения (М6.7).
final pendingActionQueueProvider = Provider<PendingActionQueue>((Ref ref) {
  return DriftPendingActionQueue(ref.watch(appDatabaseProvider));
});
