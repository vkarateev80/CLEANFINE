import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../database/database_provider.dart';
import '../shared/data/pending_actions.dart';
import 'queue_action_sender.dart';

/// Сколько действий ушло и сколько осталось — для «Отправлено {done} из {total}».
class SyncProgress {
  const SyncProgress({
    required this.done,
    required this.failed,
    required this.total,
    this.running = false,
  });

  const SyncProgress.idle() : done = 0, failed = 0, total = 0, running = false;

  final int done;
  final int failed;
  final int total;
  final bool running;

  int get processed => done + failed;
  int get remaining => total - processed;
  bool get isEmpty => total == 0;
}

/// Проход очереди действий: по одной записи, сначала SOS, потом операции
/// (DS-002 `offline.md` §5.2).
///
/// Синхронизатор не решает, «есть ли сеть»: он берёт записи, готовые по времени,
/// и отправляет их. Временная ошибка возвращает запись в очередь с задержкой,
/// постоянная (4xx) — оставляет её в `failed` с текстом для оператора.
class SyncService {
  SyncService({
    required PendingActionQueue queue,
    required QueueActionSender sender,
    DateTime Function()? now,
    double Function()? jitter,
    this.maxAttempts = 10,
  })  : _queue = queue,
        _sender = sender,
        _now = now ?? DateTime.now,
        _jitter = jitter ?? _defaultJitter;

  /// Задержки между попытками, с (DS-002 §5.2.5); дальше всегда последняя.
  static const List<Duration> backoffSteps = <Duration>[
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 10),
    Duration(seconds: 30),
    Duration(seconds: 60),
    Duration(seconds: 300),
  ];

  /// После стольких попыток запись уходит в `failed` и ждёт ручного повтора.
  final int maxAttempts;

  final PendingActionQueue _queue;
  final QueueActionSender _sender;
  final DateTime Function() _now;
  final double Function() _jitter;

  static double _defaultJitter() => Random().nextDouble() * 0.4 - 0.2;

  /// Один проход очереди. Возвращает итог: сколько ушло и сколько осталось.
  ///
  /// [onProgress] вызывается после каждой записи — по нему экраны показывают
  /// «Синхронизация: {done} из {total}» (DS-002 `offline.md` §2).
  Future<SyncProgress> runOnce({void Function(SyncProgress progress)? onProgress}) async {
    final List<PendingAction> ready = await _queue.ready(_now());
    if (ready.isEmpty) return const SyncProgress.idle();

    int done = 0;
    int failed = 0;
    onProgress?.call(
      SyncProgress(done: done, failed: failed, total: ready.length, running: true),
    );
    for (final PendingAction action in ready) {
      await _queue.markSending(action.id);
      final QueueSendResult result = await _sender.send(action);

      if (result.isSuccess) {
        await _queue.markSynced(action.id, at: _now());
        done++;
        onProgress?.call(
          SyncProgress(done: done, failed: failed, total: ready.length, running: true),
        );
        continue;
      }

      final int attempts = action.attempts + 1;
      final bool permanent = result.permanent || attempts >= maxAttempts;
      final String error = result.error ?? 'Не удалось отправить';
      if (permanent) {
        // Авто-повторов нет: оператор сам решает, повторять ли (кнопка «Повторить»).
        await _queue.markFailed(action.id, error: error, attempts: attempts);
      } else {
        // Временная ошибка: запись остаётся в очереди и вернётся по backoff.
        await _queue.scheduleRetry(
          action.id,
          error: error,
          attempts: attempts,
          nextAttemptAt: _now().add(backoff(attempts)),
        );
      }
      failed++;
      onProgress?.call(
        SyncProgress(done: done, failed: failed, total: ready.length, running: true),
      );
    }

    return SyncProgress(done: done, failed: failed, total: ready.length);
  }

  /// Задержка перед попыткой номер [attempts] с джиттером ±20 %.
  Duration backoff(int attempts) {
    final int index = (attempts - 1).clamp(0, backoffSteps.length - 1);
    final Duration base = backoffSteps[index];
    final double factor = 1 + _jitter().clamp(-0.2, 0.2);
    return Duration(milliseconds: (base.inMilliseconds * factor).round());
  }
}

final syncServiceProvider = Provider<SyncService>((Ref ref) {
  return SyncService(
    queue: ref.watch(pendingActionQueueProvider),
    sender: ref.watch(queueActionSenderProvider),
  );
});
