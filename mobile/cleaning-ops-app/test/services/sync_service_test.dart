import 'package:cleaning_ops_app/services/queue_action_sender.dart';
import 'package:cleaning_ops_app/services/sync_service.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/offline_fakes.dart';

/// М6.7: проход очереди — приоритеты, backoff, «4xx не ретраится».
void main() {
  late InMemoryPendingActionQueue queue;
  final DateTime base = DateTime(2026, 9, 16, 10, 0);
  DateTime now = base;

  setUp(() {
    now = base;
    queue = InMemoryPendingActionQueue(now: () => now);
  });

  SyncService service(ScriptedSender sender, {int maxAttempts = 10}) {
    return SyncService(
      queue: queue,
      sender: sender,
      now: () => now,
      jitter: () => 0,
      maxAttempts: maxAttempts,
    );
  }

  test('успешный проход: запись уходит в synced, прогресс «1 из 1»', () async {
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1', 'ticketId': 'ticket-1'},
      createdAt: base,
    );
    final ScriptedSender sender = ScriptedSender();
    final SyncProgress progress = await service(sender).runOnce();

    expect(progress.done, 1);
    expect(progress.failed, 0);
    expect(progress.total, 1);
    expect(sender.sent, hasLength(1));

    final List<PendingAction> actions = await queue.all();
    expect(actions.single.status, PendingActionStatus.synced);
    expect(actions.single.syncedAt, isNotNull);
    expect(await queue.pendingCount(), 0);
  });

  test('временная ошибка: попытка засчитана, повтор отложен по backoff', () async {
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    final ScriptedSender sender = ScriptedSender(
      results: const <QueueSendResult>[QueueSendResult.retryable('Нет соединения')],
    );

    final SyncProgress progress = await service(sender).runOnce();

    expect(progress.failed, 1);
    final PendingAction action = (await queue.all()).single;
    expect(action.status, PendingActionStatus.pending, reason: 'временная ошибка — запись ждёт повтора');
    expect(action.attempts, 1);
    expect(action.lastError, 'Нет соединения');
    expect(action.nextAttemptAt, isNotNull);
    expect(
      action.nextAttemptAt!.isAfter(base),
      isTrue,
      reason: 'повтор назначается на будущее, а не немедленно',
    );

    // Пока время не пришло, запись не берётся в работу.
    expect(await queue.ready(base), isEmpty);
    expect(await queue.ready(action.nextAttemptAt!), hasLength(1));
  });

  test('4xx не ретраится: запись ждёт ручного повтора', () async {
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    final ScriptedSender sender = ScriptedSender(
      results: const <QueueSendResult>[QueueSendResult.permanent('Для операции требуется фото (photoUrl)')],
    );

    await service(sender).runOnce();

    final PendingAction action = (await queue.all()).single;
    expect(action.status, PendingActionStatus.failed);
    expect(action.lastError, 'Для операции требуется фото (photoUrl)');
    expect(action.nextAttemptAt, isNull, reason: 'авто-повторов нет — только кнопка «Повторить»');
    expect(await queue.ready(base.add(const Duration(hours: 1))), isEmpty);
  });

  test('после лимита попыток запись не повторяется сама', () async {
    await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'objectId': 'object-1'},
      createdAt: base,
    );
    final ScriptedSender sender = ScriptedSender(
      results: const <QueueSendResult>[QueueSendResult.retryable('Нет соединения')],
    );

    await service(sender, maxAttempts: 1).runOnce();

    final PendingAction action = (await queue.all()).single;
    expect(action.status, PendingActionStatus.failed);
    expect(action.nextAttemptAt, isNull);
    expect(action.attempts, 1);
  });

  test('порядок прохода: SOS раньше операций, даже если создан позже', () async {
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'objectId': 'object-1'},
      createdAt: base.add(const Duration(minutes: 1)),
    );
    final ScriptedSender sender = ScriptedSender();

    await service(sender).runOnce();

    expect(sender.sent.map((PendingAction action) => action.type).toList(), <String>[
      PendingActionTypes.sos,
      PendingActionTypes.operationCompleted,
    ]);
  });

  test('ошибка одной записи не мешает отправить следующую', () async {
    await queue.add(type: PendingActionTypes.sos, payload: <String, dynamic>{}, createdAt: base);
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    final ScriptedSender sender = ScriptedSender(
      results: const <QueueSendResult>[
        QueueSendResult.retryable('Нет соединения'),
        QueueSendResult.success(),
      ],
    );

    final SyncProgress progress = await service(sender).runOnce();

    expect(progress.done, 1);
    expect(progress.failed, 1);
    expect(sender.sent, hasLength(2));
  });

  test('пустая очередь: проход ничего не делает', () async {
    final ScriptedSender sender = ScriptedSender();
    final SyncProgress progress = await service(sender).runOnce();

    expect(progress.isEmpty, isTrue);
    expect(sender.sent, isEmpty);
  });

  test('задержки повторов соответствуют DS-002: 1, 2, 5, 10, 30, 60, 300 с', () {
    final SyncService sync = service(ScriptedSender());
    expect(
      <int>[for (int attempt = 1; attempt <= 8; attempt++) sync.backoff(attempt).inSeconds],
      <int>[1, 2, 5, 10, 30, 60, 300, 300],
    );
  });

  test('джиттер держит задержку в пределах ±20 %', () {
    final SyncService sync = SyncService(
      queue: queue,
      sender: ScriptedSender(),
      now: () => now,
      jitter: () => 0.2,
    );
    expect(sync.backoff(7).inMilliseconds, (const Duration(seconds: 300).inMilliseconds * 1.2).round());

    final SyncService negative = SyncService(
      queue: queue,
      sender: ScriptedSender(),
      now: () => now,
      jitter: () => -0.2,
    );
    expect(negative.backoff(7).inMilliseconds, (300000 * 0.8).round());
  });
}
