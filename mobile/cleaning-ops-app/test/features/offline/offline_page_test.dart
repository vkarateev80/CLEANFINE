import 'package:cleaning_ops_app/core/utils/clock.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/offline/presentation/offline_texts.dart';
import 'package:cleaning_ops_app/features/offline/presentation/pages/offline_page.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/queue_action_sender.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/offline_fakes.dart';

/// М6.7: экран очереди `/offline` — список действий, синхронизация, повтор и удаление.
void main() {
  final DateTime now = DateTime(2026, 9, 16, 10, 30);

  PendingAction operation({
    String id = 'q-op',
    PendingActionStatus status = PendingActionStatus.pending,
    String? lastError,
    int attempts = 0,
    DateTime? nextAttemptAt,
  }) {
    return queued(
      id: id,
      payload: <String, dynamic>{
        'operationName': 'Смыть и вытереть насухо',
        'roomName': 'Каб. 211',
        'operationId': 'op-1',
        'ticketId': 'ticket-1',
      },
      createdAt: DateTime(2026, 9, 16, 10, 0),
      status: status,
      lastError: lastError,
      attempts: attempts,
      nextAttemptAt: nextAttemptAt,
    );
  }

  Widget wrap({
    required InMemoryPendingActionQueue queue,
    ScriptedSender? sender,
    bool online = false,
  }) {
    return ProviderScope(
      overrides: <Override>[
        pendingActionQueueProvider.overrideWithValue(queue),
        queueActionSenderProvider.overrideWithValue(sender ?? ScriptedSender()),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        nowProvider.overrideWithValue(() => now),
      ],
      child: const MaterialApp(home: OfflinePage()),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('оффлайн-баннер считает действия, а список показывает вид и статус', (tester) async {
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue(
      initial: <PendingAction>[
        operation(id: 'q-sos', status: PendingActionStatus.pending),
        operation(id: 'q-op', status: PendingActionStatus.failed, lastError: 'Нет прав', attempts: 2),
      ],
    );
    // Первый элемент списка — SOS: он приоритетнее операций.
    await queue.remove('q-sos');
    await queue.add(type: PendingActionTypes.sos, payload: <String, dynamic>{'roomName': 'Санузел 101'});

    await tester.pumpWidget(wrap(queue: queue));
    await settle(tester);

    expect(find.byKey(const Key('offline_queue_list')), findsOneWidget);
    expect(find.textContaining('Нет соединения — 2 действия ждут отправки'), findsOneWidget);
    expect(find.text('Аварийная заявка'), findsOneWidget);
    expect(find.text('Операция «Смыть и вытереть насухо» · Каб. 211'), findsOneWidget);
    expect(find.text(PendingActionStatus.failed.label), findsOneWidget);
    expect(find.text(OfflineTexts.failed('Нет прав')), findsOneWidget);
    expect(
      find.textContaining(OfflineTexts.attempts(2)),
      findsOneWidget,
      reason: 'попытки показаны в одной строке с временем создания',
    );
  });

  testWidgets('«Синхронизировать сейчас» отправляет очередь и обновляет прогресс', (tester) async {
    final PendingAction action = operation();
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue(
      initial: <PendingAction>[action],
    );

    await tester.pumpWidget(wrap(queue: queue, sender: ScriptedSender(), online: true));
    await settle(tester);

    expect(find.text(OfflineTexts.onlineReady), findsOneWidget);

    await tester.tap(find.byKey(const Key('offline_sync_now_button')));
    await tester.pumpAndSettle();

    expect(find.text(OfflineTexts.progress(1, 1)), findsOneWidget);
    final PendingAction stored = (await queue.byId(action.id))!;
    expect(stored.status, PendingActionStatus.synced);
    expect(stored.syncedAt, isNotNull);
    expect(find.text(PendingActionStatus.synced.label), findsOneWidget);
  });

  testWidgets('ошибка отправки: запись остаётся с текстом сервера и кнопкой «Повторить»', (tester) async {
    final PendingAction action = operation();
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue(
      initial: <PendingAction>[action],
    );
    final ScriptedSender sender = ScriptedSender(
      results: const <QueueSendResult>[QueueSendResult.permanent('Для операции требуется фото (photoUrl)')],
    );

    await tester.pumpWidget(wrap(queue: queue, sender: sender, online: true));
    await settle(tester);
    await tester.tap(find.byKey(const Key('offline_sync_now_button')));
    await tester.pumpAndSettle();

    expect(
      find.text(OfflineTexts.failed('Для операции требуется фото (photoUrl)')),
      findsOneWidget,
    );
    expect(find.byKey(Key('offline_item_retry_${action.id}')), findsOneWidget);

    final PendingAction stored = (await queue.byId(action.id))!;
    expect(stored.status, PendingActionStatus.failed);
    expect(stored.attempts, 1);

    // «Повторить» возвращает запись в очередь немедленно.
    await tester.tap(find.byKey(Key('offline_item_retry_${action.id}')));
    await tester.pumpAndSettle();
    expect((await queue.byId(action.id))!.status, PendingActionStatus.pending);
  });

  testWidgets('удаление требует подтверждения и убирает запись', (tester) async {
    final PendingAction action = operation();
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue(
      initial: <PendingAction>[action],
    );

    await tester.pumpWidget(wrap(queue: queue));
    await settle(tester);

    await tester.tap(find.byKey(Key('offline_item_delete_${action.id}')));
    await tester.pumpAndSettle();
    expect(find.text(OfflineTexts.deleteTitle), findsOneWidget);

    await tester.tap(find.byKey(Key('offline_delete_cancel_${action.id}')));
    await tester.pumpAndSettle();
    expect(await queue.byId(action.id), isNotNull, reason: 'отмена ничего не удаляет');

    await tester.tap(find.byKey(Key('offline_item_delete_${action.id}')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('offline_delete_confirm_${action.id}')));
    await tester.pumpAndSettle();

    expect(await queue.byId(action.id), isNull);
    expect(find.byKey(const Key('offline_empty')), findsOneWidget);
  });

  testWidgets('пустая очередь: «Очередь пуста — всё отправлено»', (tester) async {
    await tester.pumpWidget(wrap(queue: InMemoryPendingActionQueue(), online: true));
    await settle(tester);

    expect(find.byKey(const Key('offline_empty')), findsOneWidget);
    expect(find.text(OfflineTexts.empty), findsOneWidget);
    expect(find.text(OfflineTexts.progress(0, 0)), findsOneWidget);
  });

  testWidgets('запись с назначенным повтором показывает время ожидания', (tester) async {
    final PendingAction action = operation(
      nextAttemptAt: now.add(const Duration(seconds: 14)),
      attempts: 2,
    );
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue(
      initial: <PendingAction>[action],
    );

    await tester.pumpWidget(wrap(queue: queue));
    await settle(tester);

    expect(find.textContaining(OfflineTexts.retryIn(14)), findsOneWidget);
    expect(find.textContaining(OfflineTexts.attempts(2)), findsOneWidget);
  });
}
