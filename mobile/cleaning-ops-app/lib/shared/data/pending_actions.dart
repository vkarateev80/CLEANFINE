import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

/// Типы отложенных действий: то, что оператор сделал без сети.
class PendingActionTypes {
  const PendingActionTypes._();

  /// Завершение операции техкарты (`POST /api/tickets/:id/operations/:operationId/complete`).
  static const String operationCompleted = 'operation_completed';

  /// Завершение помещения: серверного эндпоинта нет (DS-002 `checklist.md` п. 11.1),
  /// отметка живёт локально и уходит бригадиру вместе с операциями.
  static const String roomCompleted = 'room_completed';
}

enum PendingActionStatus {
  pending('pending', 'Отправляется…'),
  synced('synced', 'Отправлено'),
  failed('failed', 'Ошибка отправки');

  const PendingActionStatus(this.code, this.label);

  final String code;
  final String label;

  static PendingActionStatus of(String value) => PendingActionStatus.values.firstWhere(
        (PendingActionStatus status) => status.code == value,
        orElse: () => PendingActionStatus.pending,
      );
}

/// Действие, которое не удалось отправить: в памяти (М6.4) или в drift (М6.7).
class PendingAction {
  const PendingAction({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.status = PendingActionStatus.pending,
    this.attempts = 0,
  });

  final String id;
  final String type;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final PendingActionStatus status;
  final int attempts;

  PendingAction copyWith({PendingActionStatus? status, int? attempts}) {
    return PendingAction(
      id: id,
      type: type,
      payload: payload,
      createdAt: createdAt,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
    );
  }
}

/// Очередь «сделано без сети — отправить потом».
///
/// В М6.4 очередь держится в памяти процесса: этого достаточно, чтобы завершение
/// операции не падало с ошибкой и было видно в интерфейсе. М6.7 заменяет
/// реализацию на drift-таблицу `pending_actions` (та же очередь переживёт
/// перезапуск приложения) и добавляет собственно синхронизацию с сетью.
abstract class PendingActionQueue {
  Future<PendingAction> add({required String type, required Map<String, dynamic> payload});

  Future<List<PendingAction>> pending();

  Future<int> pendingCount();
}

/// Очередь в памяти: живёт до перезапуска приложения.
class InMemoryPendingActionQueue implements PendingActionQueue {
  InMemoryPendingActionQueue({Uuid? uuid, DateTime Function()? now, List<PendingAction>? initial})
      : _uuid = uuid ?? const Uuid(),
        _now = now ?? DateTime.now,
        _actions = <PendingAction>[...?initial];

  final Uuid _uuid;
  final DateTime Function() _now;
  final List<PendingAction> _actions;

  @override
  Future<PendingAction> add({required String type, required Map<String, dynamic> payload}) async {
    final PendingAction action = PendingAction(
      id: _uuid.v4(),
      type: type,
      payload: payload,
      createdAt: _now(),
    );
    _actions.add(action);
    return action;
  }

  @override
  Future<List<PendingAction>> pending() async => _actions
      .where((PendingAction action) => action.status == PendingActionStatus.pending)
      .toList(growable: false);

  @override
  Future<int> pendingCount() async => (await pending()).length;
}

/// Очередь отложенных действий приложения.
final pendingActionQueueProvider = Provider<PendingActionQueue>((Ref ref) {
  return InMemoryPendingActionQueue();
});
