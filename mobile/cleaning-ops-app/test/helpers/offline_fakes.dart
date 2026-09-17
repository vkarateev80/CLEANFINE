import 'dart:async';

import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/queue_action_sender.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';

import 'checklist_fakes.dart';
import 'operator_fakes.dart';

/// Подмены для М6.7: сеть, отправка действий из очереди.

/// Состояние сети, задаваемое тестом.
class FakeConnectivityService implements ConnectivityService {
  FakeConnectivityService({this.online = true});

  bool online;

  final StreamController<bool> _changes = StreamController<bool>.broadcast();

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onlineChanges => _changes.stream;

  /// Переключить состояние и сообщить об этом подписчикам.
  void setOnline(bool value) {
    online = value;
    _changes.add(value);
  }

  Future<void> dispose() => _changes.close();
}

/// Отправка действий по сценарию: результаты выдаются по порядку вызовов.
class ScriptedSender extends QueueActionSender {
  ScriptedSender({
    List<QueueSendResult>? results,
    QueueSendResult fallback = const QueueSendResult.success(),
    FakeFilesRepository? files,
    FakeTicketsRepository? tickets,
    FakePhotoCaptureService? photos,
  })  : _results = <QueueSendResult>[...?results],
        _fallback = fallback,
        super(
          files: files ?? FakeFilesRepository(),
          tickets: tickets ?? FakeTicketsRepository(),
          photos: photos ?? FakePhotoCaptureService(),
        );

  final List<QueueSendResult> _results;
  final QueueSendResult _fallback;

  /// Что именно пытались отправить — для проверок порядка и состава.
  final List<PendingAction> sent = <PendingAction>[];

  @override
  Future<QueueSendResult> send(PendingAction action) async {
    sent.add(action);
    if (_results.isEmpty) return _fallback;
    return _results.removeAt(0);
  }
}

/// Готовая запись очереди с заданными полями.
PendingAction queued({
  required String id,
  String type = PendingActionTypes.operationCompleted,
  Map<String, dynamic> payload = const <String, dynamic>{},
  DateTime? createdAt,
  int attempts = 0,
  PendingActionStatus status = PendingActionStatus.pending,
  DateTime? nextAttemptAt,
  DateTime? syncedAt,
  String? lastError,
  String? idempotencyKey,
}) {
  return PendingAction(
    id: id,
    type: type,
    payload: payload,
    idempotencyKey: idempotencyKey,
    createdAt: createdAt ?? DateTime(2026, 9, 16, 10, 0),
    attempts: attempts,
    status: status,
    nextAttemptAt: nextAttemptAt,
    syncedAt: syncedAt,
    lastError: lastError,
  );
}
