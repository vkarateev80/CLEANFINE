import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/utils/clock.dart';
import '../../../../database/database_provider.dart';
import '../../../../services/floor_plan_cache.dart';
import '../../../../shared/data/cache/cache_providers.dart';
import '../../../../shared/data/cache/cache_store.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/file_models.dart';
import '../../../../shared/data/models/operation_completion.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../../../shared/data/models/tech_card_models.dart';
import '../../../../shared/data/pending_actions.dart';
import '../../../../shared/data/result.dart';
import '../../../../shared/services/location_service.dart';
import '../../../../shared/services/photo_service.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../route_map/presentation/providers/route_providers.dart';
import '../checklist_texts.dart';

/// Статус операции в чек-листе.
///
/// Сервер помнит только факт завершения (`TicketOperationCompletion`), поэтому
/// «Ожидает / В работе / Выполнено / Отправляется…» считает приложение. Те же
/// значения уходят в `checklist_operations.syncStatus`, поэтому имя значения
/// (`name`) — часть формата кэша: переименование сломает восстановление статусов.
enum OperationStatus {
  pending(ChecklistTexts.waiting),
  active(ChecklistTexts.inProgress),
  completed(ChecklistTexts.completed),

  /// Отмечено без сети: лежит в очереди и уйдёт при появлении соединения.
  queued(ChecklistTexts.sending);

  const OperationStatus(this.label);

  final String label;

  /// Код для кэша: `pending` | `active` | `completed` | `queued`.
  String get code => name;

  static OperationStatus of(String value) => OperationStatus.values.firstWhere(
        (OperationStatus status) => status.code == value,
        orElse: () => OperationStatus.pending,
      );
}

/// Операция техкарты вместе с локальным прогрессом.
class ChecklistOperationState {
  const ChecklistOperationState({
    required this.operation,
    this.status = OperationStatus.pending,
    this.startedAtLocal,
    this.completedAtLocal,
    this.photo,
    this.photoUrl,
  });

  final TechOperation operation;
  final OperationStatus status;

  /// Локальное время старта: сервер его не хранит (пробел API, DS-002 `checklist.md` п. 11.6).
  final DateTime? startedAtLocal;
  final DateTime? completedAtLocal;

  /// Снимок на устройстве до загрузки в file-service.
  final CapturedPhoto? photo;

  /// URL фото из file-service — то, что уходит в завершение операции.
  final String? photoUrl;

  bool get isCompleted => status == OperationStatus.completed || status == OperationStatus.queued;
  bool get isQueued => status == OperationStatus.queued;
  bool get isActive => status == OperationStatus.active;
  bool get hasPhoto => photo != null || photoUrl != null;

  /// Номер операции для интерфейса: `orderIndex` начинается с нуля.
  int get number => operation.orderIndex + 1;

  /// Прошло с начала операции; для завершённой — до момента завершения.
  Duration? elapsed(DateTime now) {
    final DateTime? from = startedAtLocal;
    if (from == null) return null;
    final Duration value = (completedAtLocal ?? now).difference(from);
    return value.isNegative ? Duration.zero : value;
  }

  /// Превышение нормы: показывается предупреждением и **не** блокирует завершение.
  Duration? overtime(DateTime now) {
    final Duration? value = elapsed(now);
    if (value == null) return null;
    final Duration over = value - operation.norm;
    return over.isNegative ? null : over;
  }

  ChecklistOperationState started(DateTime now) => ChecklistOperationState(
        operation: operation,
        status: OperationStatus.active,
        startedAtLocal: now,
        completedAtLocal: completedAtLocal,
        photo: photo,
        photoUrl: photoUrl,
      );

  ChecklistOperationState withPhoto(CapturedPhoto value) => ChecklistOperationState(
        operation: operation,
        status: status,
        startedAtLocal: startedAtLocal,
        completedAtLocal: completedAtLocal,
        photo: value,
        photoUrl: photoUrl,
      );

  ChecklistOperationState withUploadedPhoto(String url) => ChecklistOperationState(
        operation: operation,
        status: status,
        startedAtLocal: startedAtLocal,
        completedAtLocal: completedAtLocal,
        photoUrl: url,
      );

  ChecklistOperationState withoutPhoto() => ChecklistOperationState(
        operation: operation,
        status: status,
        startedAtLocal: startedAtLocal,
        completedAtLocal: completedAtLocal,
      );

  ChecklistOperationState finished(DateTime at, {required bool queued}) => ChecklistOperationState(
        operation: operation,
        status: queued ? OperationStatus.queued : OperationStatus.completed,
        startedAtLocal: startedAtLocal ?? at,
        completedAtLocal: at,
        photo: photo,
        photoUrl: photoUrl,
      );
}

/// Состояние чек-листа помещения.
class ChecklistState {
  const ChecklistState({
    required this.event,
    required this.room,
    required this.operations,
    this.floor,
    this.techCard,
    this.totalOperations,
    this.errorBanner,
    this.failedOperationId,
    this.pendingCount = 0,
    this.cachedAt,
    this.fromCache = false,
  });

  final ScheduleEvent event;
  final RoomDetail room;
  final FloorPlan? floor;
  final TechCardDetail? techCard;
  final List<ChecklistOperationState> operations;

  /// Всего операций у маршрута смены: по нему ticket-service считает
  /// `allOperationsCompleted` (`totalOperations` в теле завершения).
  final int? totalOperations;

  /// Ошибка последнего действия — баннер над списком операций.
  final String? errorBanner;
  final String? failedOperationId;

  /// Сколько действий лежит в очереди «отправить при появлении сети».
  final int pendingCount;

  /// Время записи кэша: «Данные от {HH:mm}» в оффлайн-баннере.
  final DateTime? cachedAt;

  /// Чек-лист нарисован из кэша: сеть ещё не ответила (DS-002 §1).
  final bool fromCache;

  bool get hasTechCard => techCard != null;
  bool get shiftOpen => event.isCheckedIn;
  String? get ticketId => event.ticketId;

  /// Отметки доступны, только если смена открыта и у смены есть заявка
  /// (DS-002 `checklist.md` §5, п. 11.4).
  bool get canSubmit => shiftOpen && ticketId != null;

  int get completedCount =>
      operations.where((ChecklistOperationState op) => op.isCompleted).length;

  int get remaining => operations.length - completedCount;

  /// Помещение пройдено: пустой техкарты достаточно (нечего отмечать).
  bool get allCompleted =>
      operations.every((ChecklistOperationState op) => op.isCompleted);

  /// Первая незавершённая операция — на неё автоматически стартует таймер.
  int get firstUncompletedIndex =>
      operations.indexWhere((ChecklistOperationState op) => !op.isCompleted);

  /// Операция заблокирована, пока не завершена предыдущая (требование М6.4).
  bool isLocked(int index) =>
      index > 0 && !operations[index - 1].isCompleted;

  ChecklistState copyWith({
    List<ChecklistOperationState>? operations,
    int? totalOperations,
    String? errorBanner,
    String? failedOperationId,
    bool clearError = false,
    int? pendingCount,
  }) {
    return ChecklistState(
      event: event,
      room: room,
      floor: floor,
      techCard: techCard,
      operations: operations ?? this.operations,
      totalOperations: totalOperations ?? this.totalOperations,
      errorBanner: clearError ? null : errorBanner ?? this.errorBanner,
      failedOperationId: clearError ? null : failedOperationId ?? this.failedOperationId,
      pendingCount: pendingCount ?? this.pendingCount,
      cachedAt: cachedAt,
      fromCache: fromCache,
    );
  }
}

/// Ключ чек-листа: смена + помещение (`/route/:eventId/room/:roomId`).
class ChecklistArgs {
  const ChecklistArgs({required this.eventId, required this.roomId});

  final String eventId;
  final String roomId;

  @override
  bool operator ==(Object other) =>
      other is ChecklistArgs && other.eventId == eventId && other.roomId == roomId;

  @override
  int get hashCode => Object.hash(eventId, roomId);
}

/// Сколько всего операций у маршрута смены.
///
/// ticket-service запоминает это число при первом вызове и по нему определяет
/// `allOperationsCompleted`. Сервер отдаёт `operationsTotal` в
/// `GET /api/routes/:id` — один запрос вместо N+1 (деталь маршрута).
/// Любая ошибка здесь не критична: завершение уходит без `totalOperations`,
/// сервер его примет.
final routeOperationsTotalProvider = FutureProvider.family<int?, String>((Ref ref, String eventId) async {
  ref.watch(sessionScopeProvider);
  final Result<ScheduleEvent> eventResult =
      await ref.read(scheduleRepositoryProvider).eventById(eventId);
  final ScheduleEvent? event = eventResult.dataOrNull;
  if (event == null || !event.hasRoute) return null;

  final Result<RouteDetail> routeResult =
      await ref.read(coreRepositoryProvider).route(event.routeId!);
  final RouteDetail? route = routeResult.dataOrNull;
  final int? total = route?.operationsTotal;
  if (total == null || total <= 0) return null;
  return total;
});

/// Чек-лист помещения (М6.4): порядок операций, таймер, фото, завершение помещения.
///
/// Данные берутся по правилу «сначала кэш, потом сеть» (DS-002 `offline.md` §1):
/// смена, помещение, техкарта и операции читаются из drift, поэтому чек-лист и
/// таймеры работают без сети, а сеть лишь обновляет кэш.
class ChecklistController extends FamilyAsyncNotifier<ChecklistState, ChecklistArgs> {
  @override
  Future<ChecklistState> build(ChecklistArgs arg) async {
    // Данные пользователя: выход и вход другого пересобирают провайдер с нуля.
    ref.watch(sessionScopeProvider);
    final CacheStore cache = ref.watch(cacheStoreProvider);
    final ScheduleEvent? event = await cache.event(arg.eventId);
    final RoomDetail? room = await cache.room(arg.roomId);
    if (event != null && room != null) {
      final ChecklistState? cached = await _fromCache(arg, event, room, cache);
      if (cached != null) {
        unawaited(_refreshInBackground(arg));
        return cached;
      }
    }
    return _loadFromNetwork(arg);
  }

  /// Чек-лист из кэша: `null`, если операций в кэше нет — тогда ждём сеть.
  Future<ChecklistState?> _fromCache(
    ChecklistArgs arg,
    ScheduleEvent event,
    RoomDetail room,
    CacheStore cache,
  ) async {
    final List<CachedOperation> cachedOperations = await cache.operations(arg.roomId);
    if (cachedOperations.isEmpty) return null;

    final TechCardDetail? techCard =
        room.techCardId == null ? null : await cache.techCard(room.techCardId!);
    return ChecklistState(
      event: event,
      room: room,
      // План этажа — файловый кэш: `plans_dir/{floorId}.img` (DS-002 §3).
      floor: room.floorId == null ? null : await _cachedFloor(room.floorId!),
      techCard: techCard,
      operations: cachedOperations.map(_fromCached).toList(growable: false),
      totalOperations: techCard?.operations.length,
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
      cachedAt: await cache.eventsUpdatedAt(),
      fromCache: true,
    );
  }

  /// Сеть: смена, помещение, этаж и техкарта; всё успешное пишется в кэш.
  Future<ChecklistState> _loadFromNetwork(ChecklistArgs arg) async {
    final Now now = ref.read(nowProvider);
    final CacheStore cache = ref.read(cacheStoreProvider);

    final Result<ScheduleEvent> eventResult =
        await ref.read(scheduleRepositoryProvider).eventById(arg.eventId);
    final Failure? eventFailure = eventResult.failureOrNull;
    if (eventFailure != null) throw eventFailure;
    final ScheduleEvent event = eventResult.dataOrNull!;
    await cache.saveEvents(<ScheduleEvent>[event]);

    final Result<RoomDetail> roomResult =
        await ref.read(coreRepositoryProvider).room(arg.roomId);
    final Failure? roomFailure = roomResult.failureOrNull;
    if (roomFailure != null) throw roomFailure;
    final RoomDetail room = roomResult.dataOrNull!;
    await cache.saveRoom(room);

    FloorPlan? floor;
    if (room.floorId != null) {
      floor = (await ref.read(coreRepositoryProvider).floor(room.floorId!)).dataOrNull;
      // План этажа кладём в `plans_dir` **в фоне**: файловый кэш (`path_provider`
      // и скачивание картинки) не задерживает отрисовку — заголовку нужен только
      // номер этажа из ответа сети (DS-002 `offline.md` §1, §3).
      if (floor != null) unawaited(_warmFloorPlan(floor));
    }

    TechCardDetail? techCard;
    if (room.techCardId != null) {
      techCard = (await ref.read(coreRepositoryProvider).techCard(room.techCardId!)).dataOrNull;
      if (techCard != null) await cache.saveTechCard(techCard);
    }

    final bool canSubmit = event.isCheckedIn && event.ticketId != null;
    final ChecklistState initial = ChecklistState(
      event: event,
      room: room,
      floor: floor,
      techCard: techCard,
      operations: _initialOperations(techCard, canSubmit: canSubmit, now: now()),
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
    );
    await _save(initial);

    // Общее число операций маршрута догружаем в фоне: экран не должен ждать N+1 запросов.
    unawaited(_warmTotalOperations(event.id));
    return initial;
  }

  /// План этажа из файлового кэша (`plans_dir/{floorId}.img`).
  ///
  /// Best-effort: сбой `path_provider` или диска не должен ронять чек-лист —
  /// операции покажутся без номера этажа в заголовке (DS-002 §1, §7).
  Future<FloorPlan?> _cachedFloor(String floorId) async {
    try {
      return (await ref.read(floorPlanCacheProvider).read(floorId))?.floor;
    } on Object {
      return null;
    }
  }

  /// Прогрев файлового кэша плана (`plans_dir/{floorId}.img`).
  ///
  /// Best-effort и в фоне: сбой диска или недоступный `path_provider` не должны
  /// оставлять чек-лист в состоянии загрузки — операции рисуются из сети/кэша.
  Future<void> _warmFloorPlan(FloorPlan floor) async {
    try {
      await ref.read(floorPlanCacheProvider).ensure(floor);
    } on Object {
      // Плана в кэше не будет: без сети экран покажет чек-лист без номера этажа.
    }
  }

  /// Фоновое обновление: ошибка сети не стирает показанный кэш.
  Future<void> _refreshInBackground(ChecklistArgs arg) async {
    final ChecklistState fresh;
    try {
      fresh = await _loadFromNetwork(arg);
    } on Object {
      // Оставляем кэш и оффлайн-баннер.
      return;
    }
    final ChecklistState? current = state.valueOrNull;
    _setState(
      current == null
          ? fresh
          // Локальный прогресс (таймеры, фото) важнее серверного состояния.
          : current.copyWith(totalOperations: fresh.totalOperations),
    );
  }

  /// Присваивание состояния с защитой от закрытого провайдера: фоновое
  /// обновление может завершиться уже после `dispose` контейнера.
  void _setState(ChecklistState value) {
    try {
      state = AsyncData<ChecklistState>(value);
    } on StateError {
      // Провайдер закрыт — обновлять нечего.
    }
  }

  /// Операция из кэша: статус, таймер и фото восстанавливаются как были.
  ChecklistOperationState _fromCached(CachedOperation cached) {
    final String? path = cached.photoLocalPath;
    return ChecklistOperationState(
      operation: cached.operation,
      status: OperationStatus.of(cached.status),
      startedAtLocal: cached.startedAtLocal,
      completedAtLocal: cached.completedAtLocal,
      photo: path == null
          ? null
          : CapturedPhoto(
              path: path,
              // Размеры снимка в кэше не хранятся: проверка «не меньше 1280×720»
              // идёт в момент съёмки, а не при отправке из очереди.
              width: 0,
              height: 0,
              takenAt: cached.startedAtLocal ?? DateTime.now(),
            ),
      photoUrl: cached.photoUrl,
    );
  }

  /// Запись операций в кэш: таймер и фото переживают перезапуск (DS-002 §5.4).
  Future<void> _save(ChecklistState value) {
    return ref.read(cacheStoreProvider).saveOperations(
          roomId: value.room.id,
          ticketId: value.ticketId,
          operations: value.operations
              .map(
                (ChecklistOperationState op) => CachedOperation(
                  operation: op.operation,
                  status: op.status.code,
                  startedAtLocal: op.startedAtLocal,
                  completedAtLocal: op.completedAtLocal,
                  photoLocalPath: op.photo?.path,
                  photoUrl: op.photoUrl,
                ),
              )
              .toList(growable: false),
        );
  }

  /// Кэш обновляется после каждого изменения состояния операций.
  void _persist() {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return;
    unawaited(_save(current));
  }

  /// Первая незавершённая операция «В работе» с запущенным таймером, остальные «Ожидает».
  List<ChecklistOperationState> _initialOperations(
    TechCardDetail? card, {
    required bool canSubmit,
    required DateTime now,
  }) {
    final List<TechOperation> operations = card?.operations ?? const <TechOperation>[];
    if (operations.isEmpty) return const <ChecklistOperationState>[];

    return <ChecklistOperationState>[
      for (int index = 0; index < operations.length; index++)
        ChecklistOperationState(
          operation: operations[index],
          status: index == 0 && canSubmit ? OperationStatus.active : OperationStatus.pending,
          startedAtLocal: index == 0 && canSubmit ? now : null,
        ),
    ];
  }

  /// Общее число операций маршрута: best-effort, ошибка не ломает чек-лист.
  Future<void> _warmTotalOperations(String eventId) async {
    try {
      final int? total = await ref.read(routeOperationsTotalProvider(eventId).future);
      if (total == null) return;
      final ChecklistState? current = state.valueOrNull;
      if (current == null) return;
      state = AsyncData<ChecklistState>(current.copyWith(totalOperations: total));
    } on Object {
      // Завершение уходит и без `totalOperations`: сервер поле не требует.
    }
  }

  /// Ручной (пере)старт отсчёта операции — кнопка «Начать».
  void startOperation(String operationId) {
    final ChecklistState? current = state.valueOrNull;
    if (current == null || !current.canSubmit) return;
    final int index = _indexOf(current, operationId);
    if (index < 0 || current.isLocked(index)) return;
    final ChecklistOperationState op = current.operations[index];
    if (op.isCompleted) return;
    _replace(index, op.started(ref.read(nowProvider)()));
  }

  /// Снимок привязан к операции: ждёт загрузки в file-service.
  void attachPhoto(String operationId, CapturedPhoto photo) {
    _update(operationId, (ChecklistOperationState op) => op.withPhoto(photo));
  }

  /// «Переснять»: локальный файл удаляется, операция снова без фото.
  Future<void> retakePhoto(String operationId) async {
    final ChecklistOperationState? op = _find(operationId);
    if (op == null) return;
    await ref.read(photoCaptureServiceProvider).delete(op.photo?.path);
    _update(operationId, (ChecklistOperationState value) => value.withoutPhoto());
  }

  /// Завершение операции: фото → file-service, затем завершение → ticket-service.
  ///
  /// Возвращает текст для snackbar, если оператору нужно что-то исправить
  /// («Сначала сделайте фото», «Фото слишком маленькое…»). Серверные ошибки
  /// показываются баннером над списком, без сети действие уходит в очередь.
  Future<String?> completeOperation(String operationId) async {
    ChecklistState? current = state.valueOrNull;
    if (current == null) return null;
    final int index = _indexOf(current, operationId);
    if (index < 0) return null;

    ChecklistOperationState op = current.operations[index];
    if (op.isCompleted) return ChecklistTexts.alreadyCompleted;
    if (!current.canSubmit || current.isLocked(index)) return null;
    if (op.operation.requiresPhoto && !op.hasPhoto) return ChecklistTexts.photoFirst;

    final DateTime now = ref.read(nowProvider)();

    // 1. Фото: сначала в file-service (сервер сам ставит водяной знак).
    if (op.photoUrl == null && op.photo != null) {
      final Result<UploadedFile> upload = await _uploadPhoto(op);
      final Failure? failure = upload.failureOrNull;
      if (failure != null) {
        if (failure is NetworkFailure) {
          return _enqueue(current, op, now, photoUrl: null);
        }
        return ChecklistTexts.photoRejected(failure.message);
      }
      _update(operationId, (ChecklistOperationState value) => value.withUploadedPhoto(upload.dataOrNull!.url));
      current = state.valueOrNull ?? current;
      op = current.operations[_indexOf(current, operationId)];
    }

    // 2. Завершение операции на сервере.
    final Result<CompleteOperationResult> result =
        await ref.read(ticketsRepositoryProvider).completeOperation(
              ticketId: current.ticketId!,
              operationId: operationId,
              roomId: current.room.id,
              completedAt: now,
              photoUrl: op.photoUrl,
              requiresPhoto: op.operation.requiresPhoto,
              totalOperations: current.totalOperations,
            );

    final Failure? failure = result.failureOrNull;
    if (failure != null) {
      if (failure is NetworkFailure) {
        return _enqueue(current, op, now, photoUrl: op.photoUrl);
      }
      _setError(ChecklistTexts.completeFailed, failedOperationId: operationId);
      return null;
    }

    await _markCompleted(operationId, now, queued: false);
    return null;
  }

  /// Повтор последней неудавшейся операции — кнопка «Повторить» в баннере.
  Future<String?> retryFailed() async {
    final String? operationId = state.valueOrNull?.failedOperationId;
    _clearError();
    if (operationId == null) return null;
    return completeOperation(operationId);
  }

  /// «Завершить помещение»: серверная отметка + локальная точка маршрута.
  ///
  /// Сервер `POST /api/tickets/:id/rooms/:roomId/complete` (М6.4) идемпотентен;
  /// без сети действие уходит в очередь. Локальная отметка `markRoomDone`
  /// ставится в любом случае — прогресс маршрута живёт и в приложении.
  Future<bool> completeRoom() async {
    final ChecklistState? current = state.valueOrNull;
    if (current == null || !current.allCompleted) return false;

    final DateTime now = ref.read(nowProvider)();
    final String? ticketId = current.ticketId;
    if (ticketId != null) {
      final Result<CompleteRoomResult> result =
          await ref.read(ticketsRepositoryProvider).completeRoom(
                ticketId: ticketId,
                roomId: current.room.id,
                completedAt: now,
              );
      final Failure? failure = result.failureOrNull;
      if (failure is NetworkFailure) {
        await ref.read(pendingActionQueueProvider).add(
              type: PendingActionTypes.roomCompleted,
              idempotencyKey: 'room:$ticketId:${current.room.id}',
              payload: <String, dynamic>{
                'eventId': current.event.id,
                'ticketId': ticketId,
                'roomId': current.room.id,
                'roomName': current.room.name,
                'completedAt': now.toUtc().toIso8601String(),
              },
            );
      }
      // Остальные ошибки сервера не блокируют локальную отметку: оператор
      // уже закрыл все операции помещения, и точка маршрута должна стать done.
    }

    final RouteDayController routeDay =
        ref.read(routeDayProvider(current.event.id).notifier);
    if (ref.read(routeDayProvider(current.event.id)).valueOrNull == null) {
      // Маршрут ещё грузится (переход из «Сегодня»): дожидаемся, иначе отметка потеряется.
      try {
        await ref.read(routeDayProvider(current.event.id).future);
      } on Object {
        // Маршрут недоступен: отметка всё равно ставится локально.
      }
    }
    routeDay.markRoomDone(current.room.id);
    return true;
  }

  Future<Result<UploadedFile>> _uploadPhoto(ChecklistOperationState op) async {
    // Координаты — последняя известная позиция; без них загрузка тоже проходит.
    GeoPoint? point;
    try {
      point = await ref.read(locationServiceProvider).currentPosition();
    } on Object {
      point = null;
    }
    return ref.read(filesRepositoryProvider).uploadPhoto(
          filePath: op.photo!.path,
          takenAt: op.photo!.takenAt,
          lat: point?.lat,
          lng: point?.lng,
        );
  }

  /// Без сети: действие уходит в очередь и операция помечается «Отправляется…».
  Future<String?> _enqueue(
    ChecklistState current,
    ChecklistOperationState op,
    DateTime now, {
    required String? photoUrl,
  }) async {
    await ref.read(pendingActionQueueProvider).add(
          type: PendingActionTypes.operationCompleted,
          // Ключ идемпотентности: повтор из очереди не создаст второе завершение
          // той же операции того же помещения (`roomId` входит в ключ сервера).
          idempotencyKey: 'op:${current.ticketId}:${current.room.id}:${op.operation.id}',
          payload: <String, dynamic>{
            'eventId': current.event.id,
            'roomId': current.room.id,
            // Названия нужны экрану очереди `/offline` (DS-002 `offline.md` §9).
            'roomName': current.room.name,
            'operationName': op.operation.name,
            'ticketId': current.ticketId,
            'operationId': op.operation.id,
            'completedAt': now.toUtc().toIso8601String(),
            if (photoUrl != null) 'photoUrl': photoUrl,
            if (op.photo != null) 'localPhotoPath': op.photo!.path,
            'requiresPhoto': op.operation.requiresPhoto,
            if (current.totalOperations != null) 'totalOperations': current.totalOperations,
          },
        );
    await _markCompleted(op.operation.id, now, queued: true);

    final ChecklistState? latest = state.valueOrNull;
    if (latest != null) {
      state = AsyncData<ChecklistState>(
        latest.copyWith(pendingCount: await ref.read(pendingActionQueueProvider).pendingCount()),
      );
    }
    return null;
  }

  /// Отметка «выполнено»: строка закрывается, следующая операция стартует сама.
  Future<void> _markCompleted(String operationId, DateTime at, {required bool queued}) async {
    final ChecklistOperationState? before = _find(operationId);
    _update(operationId, (ChecklistOperationState op) => op.finished(at, queued: queued));

    // Файл хранится только до успешной отправки: при очереди он нужен синхронизации.
    if (!queued && before?.photo != null) {
      await ref.read(photoCaptureServiceProvider).delete(before!.photo!.path);
    }

    final ChecklistState? current = state.valueOrNull;
    if (current == null || !current.canSubmit) return;
    final int index = _indexOf(current, operationId);
    final int next = index + 1;
    if (index < 0 || next >= current.operations.length) return;
    final ChecklistOperationState following = current.operations[next];
    if (!following.isCompleted && following.startedAtLocal == null) {
      _replace(next, following.started(at));
    }
  }

  ChecklistOperationState? _find(String operationId) {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return null;
    final int index = _indexOf(current, operationId);
    return index < 0 ? null : current.operations[index];
  }

  int _indexOf(ChecklistState current, String operationId) =>
      current.operations.indexWhere(
        (ChecklistOperationState op) => op.operation.id == operationId,
      );

  void _replace(int index, ChecklistOperationState value) {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return;
    final List<ChecklistOperationState> operations =
        List<ChecklistOperationState>.of(current.operations);
    operations[index] = value;
    state = AsyncData<ChecklistState>(current.copyWith(operations: operations));
    // Прогресс операции (таймер, фото, статус) сразу уходит в кэш.
    _persist();
  }

  void _update(String operationId, ChecklistOperationState Function(ChecklistOperationState) change) {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return;
    final int index = _indexOf(current, operationId);
    if (index < 0) return;
    _replace(index, change(current.operations[index]));
  }

  void _setError(String message, {String? failedOperationId}) {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData<ChecklistState>(
      current.copyWith(errorBanner: message, failedOperationId: failedOperationId),
    );
  }

  void _clearError() {
    final ChecklistState? current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData<ChecklistState>(current.copyWith(clearError: true));
  }
}

final checklistProvider =
    AsyncNotifierProvider.family<ChecklistController, ChecklistState, ChecklistArgs>(
  ChecklistController.new,
);
