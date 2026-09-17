import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/utils/clock.dart';
import '../../../../database/database_provider.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/file_models.dart';
import '../../../../shared/data/models/operation_completion.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../../../shared/data/models/tech_card_models.dart';
import '../../../../shared/data/pending_actions.dart';
import '../../../../shared/data/repositories/operator_repositories.dart';
import '../../../../shared/data/result.dart';
import '../../../../shared/services/location_service.dart';
import '../../../../shared/services/photo_service.dart';
import '../../../route_map/presentation/providers/route_providers.dart';
import '../checklist_texts.dart';

/// Статус операции в чек-листе.
///
/// Сервер помнит только факт завершения (`TicketOperationCompletion`), поэтому
/// «Ожидает / В работе / Выполнено / Отправляется…» считает приложение.
enum OperationStatus {
  pending(ChecklistTexts.waiting),
  active(ChecklistTexts.inProgress),
  completed(ChecklistTexts.completed),

  /// Отмечено без сети: лежит в очереди и уйдёт при появлении соединения.
  queued(ChecklistTexts.sending);

  const OperationStatus(this.label);

  final String label;
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
/// `allOperationsCompleted`. Отдельного эндпоинта нет, поэтому сумму
/// `operations.length` по всем точкам маршрута считает клиент (N+1 запросов,
/// значение кэшируется провайдером на смену). Любая ошибка здесь не критична:
/// завершение уходит без `totalOperations`, сервер его примет.
final routeOperationsTotalProvider = FutureProvider.family<int?, String>((Ref ref, String eventId) async {
  final Result<ScheduleEvent> eventResult =
      await ref.read(scheduleRepositoryProvider).eventById(eventId);
  final ScheduleEvent? event = eventResult.dataOrNull;
  if (event == null || !event.hasRoute) return null;

  final Result<RouteDetail> routeResult =
      await ref.read(coreRepositoryProvider).route(event.routeId!);
  final RouteDetail? route = routeResult.dataOrNull;
  if (route == null || route.points.isEmpty) return null;

  final CoreRepository core = ref.read(coreRepositoryProvider);
  final List<Result<RoomDetail>> rooms = await Future.wait(
    route.points.map((RoutePointView point) => core.room(point.roomId)),
  );
  final Set<String> techCardIds = <String>{
    for (final Result<RoomDetail> room in rooms)
      if (room.dataOrNull?.techCardId != null) room.dataOrNull!.techCardId!,
  };
  if (techCardIds.isEmpty) return null;

  final List<Result<TechCardDetail>> cards = await Future.wait(
    techCardIds.map((String id) => core.techCard(id)),
  );
  int total = 0;
  for (final Result<TechCardDetail> card in cards) {
    total += card.dataOrNull?.operations.length ?? 0;
  }
  return total == 0 ? null : total;
});

/// Чек-лист помещения (М6.4): порядок операций, таймер, фото, завершение помещения.
class ChecklistController extends FamilyAsyncNotifier<ChecklistState, ChecklistArgs> {
  @override
  Future<ChecklistState> build(ChecklistArgs arg) async {
    final Now now = ref.watch(nowProvider);

    final Result<ScheduleEvent> eventResult =
        await ref.watch(scheduleRepositoryProvider).eventById(arg.eventId);
    final Failure? eventFailure = eventResult.failureOrNull;
    if (eventFailure != null) throw eventFailure;
    final ScheduleEvent event = eventResult.dataOrNull!;

    final Result<RoomDetail> roomResult =
        await ref.watch(coreRepositoryProvider).room(arg.roomId);
    final Failure? roomFailure = roomResult.failureOrNull;
    if (roomFailure != null) throw roomFailure;
    final RoomDetail room = roomResult.dataOrNull!;

    FloorPlan? floor;
    if (room.floorId != null) {
      floor = (await ref.watch(coreRepositoryProvider).floor(room.floorId!)).dataOrNull;
    }

    TechCardDetail? techCard;
    if (room.techCardId != null) {
      techCard = (await ref.watch(coreRepositoryProvider).techCard(room.techCardId!)).dataOrNull;
    }

    final ChecklistState initial = ChecklistState(
      event: event,
      room: room,
      floor: floor,
      techCard: techCard,
      operations: _initialOperations(
        techCard,
        canSubmit: event.isCheckedIn && event.ticketId != null,
        now: now(),
      ),
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
    );

    // Общее число операций маршрута догружаем в фоне: экран не должен ждать N+1 запросов.
    unawaited(_warmTotalOperations(event.id));
    return initial;
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

  /// «Завершить помещение»: локальная отметка точки маршрута (`markRoomDone`).
  ///
  /// Серверного эндпоинта завершения помещения нет — это пробел API
  /// (DS-002 `checklist.md` п. 11.1), прогресс живёт в приложении.
  Future<bool> completeRoom() async {
    final ChecklistState? current = state.valueOrNull;
    if (current == null || !current.allCompleted) return false;

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
          // Ключ идемпотентности из DS-002 `offline.md` §4.2: повтор из очереди
          // не создаст второе завершение той же операции.
          idempotencyKey: 'op:${current.ticketId}:${op.operation.id}',
          payload: <String, dynamic>{
            'eventId': current.event.id,
            'roomId': current.room.id,
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
