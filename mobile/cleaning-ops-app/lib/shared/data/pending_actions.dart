import 'package:uuid/uuid.dart';

/// Виды отложенных действий оператора (DS-002 `offline.md` §4.1).
///
/// Значение `kind` пишется в drift, поэтому строки не переименовываются задним
/// числом: по ним строится и `idempotencyKey`, и приоритет отправки.
class PendingActionTypes {
  const PendingActionTypes._();

  /// Аварийная заявка: (1) загрузка фото → (2) `POST /api/tickets/emergency` →
  /// (3) привязка фото. Серверной идемпотентности у SOS нет, поэтому ключ
  /// (`sos:<clientRequestId>`) живёт только на устройстве.
  static const String sos = 'sos';

  /// Привязка фото к уже созданной аварийной заявке.
  ///
  /// Отдельная запись, а не повтор всей цепочки `sos`: заявка уже существует, а
  /// идемпотентности у `POST /api/tickets/emergency` нет — повтор создал бы дубль
  /// (DS-002 `sos.md` п. 10.4).
  static const String sosAttachPhoto = 'sos_attach_photo';

  /// Завершение операции техкарты (`POST /api/tickets/:id/operations/:operationId/complete`).
  static const String operationCompleted = 'operation_completed';

  /// Завершение помещения маршрута (`POST /api/tickets/:id/rooms/:roomId/complete`, М6.4).
  /// Приоритет 3 — после операций: помещение закрывается, когда его операции ушли.
  static const String roomCompleted = 'room_completed';

  /// Сообщение в чат (М6.8, DS-002 `offline.md` §4.1): основной путь — WS
  /// `message:send`, фолбэк — `POST /api/chat/chats/:id/messages`.
  ///
  /// Приоритет 4 — после операций и пропусков точек: сообщение подождёт, а
  /// завершение операции устареет.
  static const String chatMessage = 'chat_message';

  /// Приоритет отправки: меньше — раньше (DS-002 `offline.md` §4.1).
  static int priorityOf(String kind) => switch (kind) {
        sos => 1,
        operationCompleted => 2,
        sosAttachPhoto => 3,
        roomCompleted => 3,
        chatMessage => 4,
        _ => 9,
      };
}

/// Статус записи очереди: подписи дословно из DS-002 `offline.md` §9.
enum PendingActionStatus {
  pending('pending', 'Ожидает'),
  sending('sending', 'Отправляется…'),
  synced('synced', 'Отправлено'),
  failed('failed', 'Ошибка');

  const PendingActionStatus(this.code, this.label);

  final String code;
  final String label;

  static PendingActionStatus of(String value) => PendingActionStatus.values.firstWhere(
        (PendingActionStatus status) => status.code == value,
        orElse: () => PendingActionStatus.pending,
      );
}

/// Действие оператора, которое не ушло на сервер (таблица `pending_actions`).
class PendingAction {
  const PendingAction({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.idempotencyKey,
    this.status = PendingActionStatus.pending,
    this.attempts = 0,
    this.lastError,
    this.nextAttemptAt,
    this.syncedAt,
  });

  /// Локальный uuid v4: ключ интерфейса и логов.
  final String id;

  /// `kind` из DS-002: `sos`, `operation_completed`, …
  final String type;

  final Map<String, dynamic> payload;

  /// `op:<ticketId>:<operationId>` | `sos:<clientRequestId>` — защита от дублей.
  final String? idempotencyKey;

  final DateTime createdAt;
  final PendingActionStatus status;

  /// Сколько раз пытались отправить.
  final int attempts;

  /// Текст последней ошибки: его видит оператор на `/offline`.
  final String? lastError;

  /// Когда пробовать снова (экспоненциальная задержка, DS-002 §5.2).
  final DateTime? nextAttemptAt;

  final DateTime? syncedAt;

  /// Записи, которые ещё не ушли на сервер (для счётчика в `AppBar`).
  bool get isOutgoing =>
      status == PendingActionStatus.pending ||
      status == PendingActionStatus.sending ||
      status == PendingActionStatus.failed;

  int get priority => PendingActionTypes.priorityOf(type);

  PendingAction copyWith({
    PendingActionStatus? status,
    int? attempts,
    String? lastError,
    bool clearLastError = false,
    DateTime? nextAttemptAt,
    DateTime? syncedAt,
  }) {
    return PendingAction(
      id: id,
      type: type,
      payload: payload,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
      lastError: clearLastError ? null : lastError ?? this.lastError,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      syncedAt: syncedAt ?? this.syncedAt,
    );
  }
}

/// Очередь «сделано без сети — отправить потом».
///
/// Рабочая реализация — drift (`lib/database`): очередь переживает перезапуск
/// приложения. [InMemoryPendingActionQueue] остаётся для тестов и для случая,
/// когда база недоступна (например, на платформе без sqlite3).
abstract class PendingActionQueue {
  /// Кладёт действие в очередь. [idempotencyKey] защищает от дублей при повторе.
  Future<PendingAction> add({
    required String type,
    required Map<String, dynamic> payload,
    String? idempotencyKey,
    DateTime? createdAt,
  });

  /// Все записи в порядке приоритета и времени создания — для экрана `/offline`.
  Future<List<PendingAction>> all();

  /// Записи, готовые к отправке сейчас: `pending` и `nextAttemptAt <= now`.
  ///
  /// Сначала по приоритету вида действия, внутри вида — FIFO (DS-002 §5.2).
  Future<List<PendingAction>> ready(DateTime now);

  /// Сколько действий ждёт отправки (`pending` + `sending` + `failed`).
  Future<int> pendingCount();

  Future<PendingAction?> byId(String id);

  Future<void> markSending(String id);

  Future<void> markSynced(String id, {DateTime? at});

  /// Временная ошибка: запись возвращается в `pending`, повтор — в [nextAttemptAt]
  /// (DS-002 `offline.md` §5.2.4).
  Future<void> scheduleRetry(
    String id, {
    required String error,
    required int attempts,
    required DateTime nextAttemptAt,
  });

  /// Постоянная ошибка (4xx) или исчерпан лимит попыток: авто-повторов больше нет,
  /// запись ждёт кнопки «Повторить» (DS-002 §5.2.7).
  Future<void> markFailed(String id, {required String error, required int attempts});

  /// Ручной повтор: отправлять немедленно, счётчик попыток не сбрасываем.
  Future<void> retryNow(String id);

  Future<void> remove(String id);
}

/// Очередь в памяти: живёт до перезапуска приложения, используется в тестах.
class InMemoryPendingActionQueue implements PendingActionQueue {  InMemoryPendingActionQueue({Uuid? uuid, DateTime Function()? now, List<PendingAction>? initial})
      : _uuid = uuid ?? const Uuid(),
        _now = now ?? DateTime.now,
        _actions = <PendingAction>[...?initial];

  final Uuid _uuid;
  final DateTime Function() _now;
  final List<PendingAction> _actions;

  PendingAction? _find(String id) {
    for (final PendingAction action in _actions) {
      if (action.id == id) return action;
    }
    return null;
  }

  void _replace(PendingAction updated) {
    final int index = _actions.indexWhere((PendingAction action) => action.id == updated.id);
    if (index >= 0) _actions[index] = updated;
  }

  /// Приоритет вида действия, внутри вида — FIFO.
  List<PendingAction> _sorted(Iterable<PendingAction> source) {
    final List<PendingAction> list = source.toList();
    list.sort((PendingAction a, PendingAction b) {
      final int byPriority = a.priority.compareTo(b.priority);
      return byPriority != 0 ? byPriority : a.createdAt.compareTo(b.createdAt);
    });
    return list;
  }

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
    _actions.add(action);
    return action;
  }

  @override
  Future<List<PendingAction>> all() async => _sorted(_actions);

  @override
  Future<List<PendingAction>> ready(DateTime now) async => _sorted(
        _actions.where(
          (PendingAction action) =>
              action.status == PendingActionStatus.pending &&
              (action.nextAttemptAt == null || !action.nextAttemptAt!.isAfter(now)),
        ),
      );

  @override
  Future<int> pendingCount() async =>
      _actions.where((PendingAction action) => action.isOutgoing).length;

  @override
  Future<PendingAction?> byId(String id) async => _find(id);

  @override
  Future<void> markSending(String id) async {
    final PendingAction? action = _find(id);
    if (action != null) _replace(action.copyWith(status: PendingActionStatus.sending));
  }

  @override
  Future<void> markSynced(String id, {DateTime? at}) async {
    final PendingAction? action = _find(id);
    if (action == null) return;
    _replace(
      action.copyWith(
        status: PendingActionStatus.synced,
        syncedAt: at ?? _now(),
        clearLastError: true,
      ),
    );
  }

  @override
  Future<void> scheduleRetry(
    String id, {
    required String error,
    required int attempts,
    required DateTime nextAttemptAt,
  }) async {
    final PendingAction? action = _find(id);
    if (action == null) return;
    _replace(
      action.copyWith(
        status: PendingActionStatus.pending,
        attempts: attempts,
        lastError: error,
        nextAttemptAt: nextAttemptAt,
      ),
    );
  }

  @override
  Future<void> markFailed(String id, {required String error, required int attempts}) async {
    final PendingAction? action = _find(id);
    if (action == null) return;
    _replace(
      action.copyWith(
        status: PendingActionStatus.failed,
        attempts: attempts,
        lastError: error,
      ),
    );
  }

  @override
  Future<void> retryNow(String id) async {
    final PendingAction? action = _find(id);
    if (action == null) return;
    _replace(action.copyWith(status: PendingActionStatus.pending, nextAttemptAt: _now()));
  }

  @override
  Future<void> remove(String id) async {
    _actions.removeWhere((PendingAction action) => action.id == id);
  }
}
