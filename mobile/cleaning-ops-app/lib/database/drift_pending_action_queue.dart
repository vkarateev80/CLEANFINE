import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../shared/data/pending_actions.dart';
import 'app_database.dart';

/// Очередь действий поверх drift: переживает перезапуск приложения.
///
/// Правила очереди — DS-002 `offline.md` §4.2 и §5.2: приоритет по виду действия,
/// FIFO внутри вида, счётчик попыток и время следующей попытки хранятся в строке.
class DriftPendingActionQueue implements PendingActionQueue {
  DriftPendingActionQueue(this._db, {Uuid? uuid, DateTime Function()? now})
      : _uuid = uuid ?? const Uuid(),
        _now = now ?? DateTime.now;

  final AppDatabase _db;
  final Uuid _uuid;
  final DateTime Function() _now;

  @override
  Future<PendingAction> add({
    required String type,
    required Map<String, dynamic> payload,
    String? idempotencyKey,
    DateTime? createdAt,
  }) async {
    final PendingAction action = PendingAction(
      id: _uuid.v4(),
      type: type,
      payload: payload,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt ?? _now(),
    );
    await _db.insertAction(toCompanion(action));
    return action;
  }

  @override
  Future<List<PendingAction>> all() async => _sorted(
        (await _db.allRows()).map(toDomain),
      );

  @override
  Future<List<PendingAction>> ready(DateTime now) async => _sorted(
        (await _db.pendingRows(now)).map(toDomain),
      );

  @override
  Future<int> pendingCount() => _db.outgoingCount();

  @override
  Future<PendingAction?> byId(String id) async {
    final PendingActionRow? row = await _db.rowById(id);
    return row == null ? null : toDomain(row);
  }

  @override
  Future<void> markSending(String id) {
    return _db.updateAction(
      id,
      const PendingActionsCompanion(status: Value<String>('sending')),
    );
  }

  @override
  Future<void> markSynced(String id, {DateTime? at}) {
    return _db.updateAction(
      id,
      PendingActionsCompanion(
        status: const Value<String>('synced'),
        syncedAt: Value<DateTime>(at ?? _now()),
        lastError: const Value<String?>(null),
        nextAttemptAt: const Value<DateTime?>(null),
      ),
    );
  }

  @override
  Future<void> markFailed(
    String id, {
    required String error,
    required int attempts,
    DateTime? nextAttemptAt,
  }) {
    return _db.updateAction(
      id,
      PendingActionsCompanion(
        status: const Value<String>('failed'),
        attempts: Value<int>(attempts),
        lastError: Value<String?>(error),
        nextAttemptAt: Value<DateTime?>(nextAttemptAt),
      ),
    );
  }

  @override
  Future<void> retryNow(String id) {
    return _db.updateAction(
      id,
      PendingActionsCompanion(
        status: const Value<String>('pending'),
        nextAttemptAt: Value<DateTime?>(_now()),
      ),
    );
  }

  @override
  Future<void> remove(String id) => _db.deleteAction(id);

  /// Приоритет вида действия, внутри вида — FIFO по времени создания.
  List<PendingAction> _sorted(Iterable<PendingAction> source) {
    final List<PendingAction> list = source.toList();
    list.sort((PendingAction a, PendingAction b) {
      final int byPriority = a.priority.compareTo(b.priority);
      return byPriority != 0 ? byPriority : a.createdAt.compareTo(b.createdAt);
    });
    return list;
  }
}

/// Строка drift → доменная модель.
PendingAction toDomain(PendingActionRow row) {
  return PendingAction(
    id: row.id,
    type: row.kind,
    payload: decodePayload(row.payloadJson),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    status: PendingActionStatus.of(row.status),
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    syncedAt: row.syncedAt,
  );
}

/// Доменная модель → строка drift.
PendingActionsCompanion toCompanion(PendingAction action) {
  return PendingActionsCompanion(
    id: Value<String>(action.id),
    kind: Value<String>(action.type),
    payloadJson: Value<String>(jsonEncode(action.payload)),
    idempotencyKey: Value<String?>(action.idempotencyKey),
    status: Value<String>(action.status.code),
    attempts: Value<int>(action.attempts),
    lastError: Value<String?>(action.lastError),
    nextAttemptAt: Value<DateTime?>(action.nextAttemptAt),
    createdAt: Value<DateTime>(action.createdAt),
    syncedAt: Value<DateTime?>(action.syncedAt),
  );
}

/// Разбор payload: битая или чужая строка не должна ронять очередь.
Map<String, dynamic> decodePayload(String raw) {
  try {
    final dynamic decoded = jsonDecode(raw);
    if (decoded is Map) {
      return decoded.map(
        (dynamic key, dynamic value) => MapEntry<String, dynamic>(key.toString(), value),
      );
    }
  } on FormatException {
    // Ниже вернём пустую нагрузку: запись останется видимой в очереди.
  }
  return <String, dynamic>{};
}
