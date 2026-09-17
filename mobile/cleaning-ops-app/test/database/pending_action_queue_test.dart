import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/drift_pending_action_queue.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';

/// М6.7: очередь действий на drift — переживает перезапуск, хранит попытки,
/// ошибки и время следующей попытки (DS-002 `offline.md` §4.2, §5.2).
void main() {
  late AppDatabase database;
  late DriftPendingActionQueue queue;

  final DateTime base = DateTime(2026, 9, 16, 10, 0);

  setUp(() {
    database = AppDatabase.memory();
    queue = DriftPendingActionQueue(database, now: () => base);
  });

  tearDown(() => database.close());

  test('действие из очереди переживает перезапуск приложения', () async {
    await queue.add(
      type: PendingActionTypes.operationCompleted,
      idempotencyKey: 'op:ticket-1:op-1',
      payload: <String, dynamic>{'operationId': 'op-1', 'ticketId': 'ticket-1'},
      createdAt: base,
    );

    // «Перезапуск»: та же база, новый экземпляр очереди.
    final DriftPendingActionQueue restarted = DriftPendingActionQueue(database, now: () => base);
    final List<PendingAction> stored = await restarted.all();

    expect(stored, hasLength(1));
    expect(stored.single.type, PendingActionTypes.operationCompleted);
    expect(stored.single.payload['operationId'], 'op-1');
    expect(stored.single.idempotencyKey, 'op:ticket-1:op-1');
    expect(stored.single.status, PendingActionStatus.pending);
    expect(stored.single.attempts, 0);
  });

  test('счётчик считает pending, sending и failed, но не synced', () async {
    final PendingAction first = await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'clientRequestId': 'c-1'},
      createdAt: base,
    );
    final PendingAction second = await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base.add(const Duration(minutes: 1)),
    );
    final PendingAction third = await queue.add(
      type: PendingActionTypes.sosAttachPhoto,
      payload: <String, dynamic>{'fileId': 'file-1'},
      createdAt: base.add(const Duration(minutes: 2)),
    );

    expect(await queue.pendingCount(), 3);

    await queue.markSending(second.id);
    expect(await queue.pendingCount(), 3, reason: 'запись в отправке всё ещё не ушла');

    await queue.markSynced(second.id, at: base);
    expect(await queue.pendingCount(), 2);

    await queue.markFailed(third.id, error: 'Вы не участник этого чата', attempts: 1);
    expect(await queue.pendingCount(), 2, reason: 'ошибка тоже требует внимания оператора');

    expect((await queue.byId(first.id))!.type, PendingActionTypes.sos);
  });

  test('готовые к отправке идут по приоритету вида и FIFO внутри вида', () async {
    // Операции созданы раньше SOS — порядок задаёт приоритет, а не время.
    final PendingAction operation = await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    final PendingAction second = await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-2'},
      createdAt: base.add(const Duration(minutes: 1)),
    );
    final PendingAction sos = await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'clientRequestId': 'c-1'},
      createdAt: base.add(const Duration(minutes: 2)),
    );

    final List<PendingAction> ready = await queue.ready(base.add(const Duration(minutes: 5)));

    expect(
      ready.map((PendingAction action) => action.id).toList(),
      <String>[sos.id, operation.id, second.id],
    );
  });

  test('запись с будущим nextAttemptAt не попадает в готовые', () async {
    final PendingAction action = await queue.add(
      type: PendingActionTypes.operationCompleted,
      payload: <String, dynamic>{'operationId': 'op-1'},
      createdAt: base,
    );
    await queue.markFailed(
      action.id,
      error: 'Нет соединения',
      attempts: 1,
      nextAttemptAt: base.add(const Duration(seconds: 30)),
    );

    expect(await queue.ready(base), isEmpty, reason: 'ещё не время следующей попытки');

    await queue.retryNow(action.id);
    final List<PendingAction> ready = await queue.ready(base);
    expect(ready, hasLength(1));
    expect(ready.single.status, PendingActionStatus.pending);
    expect(ready.single.attempts, 1, reason: 'счётчик попыток ручной повтор не сбрасывает');
  });

  test('успешная отправка сохраняет syncedAt и чистит ошибку', () async {
    final PendingAction action = await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'clientRequestId': 'c-1'},
      createdAt: base,
    );
    await queue.markFailed(action.id, error: 'Нет соединения', attempts: 2);
    await queue.markSynced(action.id, at: base.add(const Duration(minutes: 3)));

    final PendingAction stored = (await queue.byId(action.id))!;
    expect(stored.status, PendingActionStatus.synced);
    expect(stored.syncedAt, base.add(const Duration(minutes: 3)));
    expect(stored.lastError, isNull);
    expect(await queue.ready(base.add(const Duration(minutes: 10))), isEmpty);
  });

  test('удаление убирает запись из очереди', () async {
    final PendingAction action = await queue.add(
      type: PendingActionTypes.sos,
      payload: <String, dynamic>{'clientRequestId': 'c-1'},
      createdAt: base,
    );
    await queue.remove(action.id);

    expect(await queue.all(), isEmpty);
    expect(await queue.byId(action.id), isNull);
  });

  test('GPS-буфер: точки копятся, батч берёт только неотправленные', () async {
    for (int i = 0; i < 3; i++) {
      await database.insertGpsPoint(
        GpsPointsCompanion.insert(
          lat: 55.75 + i,
          lng: 37.61 + i,
          timestamp: base.add(Duration(minutes: i)),
          accuracy: const Value<double>(5),
        ),
      );
    }

    expect(await database.unsyncedGpsCount(), 3);
    final List<GpsPointRow> batch = await database.unsyncedGpsPoints();
    expect(batch, hasLength(3));
    expect(batch.first.timestamp.isBefore(batch.last.timestamp), isTrue, reason: 'FIFO по времени');

    await database.markGpsPointsSynced(<int>[batch.first.id]);
    expect(await database.unsyncedGpsCount(), 2);

    await database.deleteGpsPoints(<int>[batch.last.id]);
    expect(await database.unsyncedGpsCount(), 1);
  });

  test('битый payload не роняет очередь', () async {
    await database.insertAction(
      PendingActionsCompanion.insert(
        id: 'broken',
        kind: PendingActionTypes.sos,
        payloadJson: 'не json',
        createdAt: base,
      ),
    );

    final List<PendingAction> actions = await queue.all();
    expect(actions.single.id, 'broken');
    expect(actions.single.payload, isEmpty);
  });
}
