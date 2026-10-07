import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/theme/app_colors.dart';
import '../../../database/app_cache.dart';
import '../../../database/app_database.dart';
import '../models/operator_models.dart';
import '../models/schedule_event.dart';
import '../models/tech_card_models.dart';

/// Операция чек-листа в кэше: сама операция плюс локальный прогресс.
///
/// Отдельный тип, а не состояние экрана: кэш не знает про Riverpod, а чек-лист —
/// про drift (`design/screens/mobile/offline.md` §3, `checklist_operations`).
class CachedOperation {
  const CachedOperation({
    required this.operation,
    this.status = 'pending',
    this.startedAtLocal,
    this.completedAtLocal,
    this.photoLocalPath,
    this.photoFileId,
    this.photoUrl,
  });

  final TechOperation operation;

  /// `pending` | `active` | `completed` | `queued` — тот же код, что у
  /// `OperationStatus` в чек-листе.
  final String status;

  final DateTime? startedAtLocal;
  final DateTime? completedAtLocal;
  final String? photoLocalPath;
  final String? photoFileId;
  final String? photoUrl;

  CachedOperation copyWith({
    String? status,
    DateTime? startedAtLocal,
    DateTime? completedAtLocal,
    String? photoLocalPath,
    String? photoFileId,
    String? photoUrl,
  }) {
    return CachedOperation(
      operation: operation,
      status: status ?? this.status,
      startedAtLocal: startedAtLocal ?? this.startedAtLocal,
      completedAtLocal: completedAtLocal ?? this.completedAtLocal,
      photoLocalPath: photoLocalPath ?? this.photoLocalPath,
      photoFileId: photoFileId ?? this.photoFileId,
      photoUrl: photoUrl ?? this.photoUrl,
    );
  }
}

/// Кэш чтения на drift (DS-002 `offline.md` §3).
///
/// Каждый успешный ответ сервера пишется сюда, каждый экран сначала читает
/// отсюда и только потом идёт в сеть (§1, «сначала кэш, потом сеть»). Доменные
/// модели конвертируются в строки здесь, поэтому экраны работают с обычными
/// моделями и не знают о drift.
class CacheStore {
  CacheStore(this._db);

  final AppDatabase _db;

  // ------------------------------------------------------------- смены

  Future<void> saveEvents(List<ScheduleEvent> events, {DateTime? at}) {
    final DateTime stamp = at ?? DateTime.now();
    return _db.upsertShiftEvents(
      events
          .map(
            (ScheduleEvent event) => ShiftEventsCompanion(
              id: Value<String>(event.id),
              scheduleId: Value<String?>(event.scheduleId),
              scheduleName: Value<String>(event.scheduleName),
              objectId: Value<String?>(event.objectId),
              routeId: Value<String?>(event.routeId),
              date: Value<String?>(event.date),
              plannedStart: Value<String?>(event.plannedStart),
              status: Value<String>(event.status),
              ticketId: Value<String?>(event.ticketId),
              checkOutReason: Value<String?>(event.checkOutReason),
              updatedAt: Value<DateTime>(stamp),
            ),
          )
          .toList(growable: false),
    );
  }

  /// Смена изменилась на сервере (check-in/check-out): пишем это в кэш сразу,
  /// иначе экран до ответа сети показывал бы старый статус из кэша.
  Future<void> saveEventStatus(
    String id, {
    required String status,
    String? checkOutReason,
  }) {
    return _db.updateShiftEventStatus(
      id,
      status: status,
      checkOutReason: checkOutReason,
    );
  }

  Future<List<ScheduleEvent>> events({String? date}) async {
    final List<ShiftEventRow> rows =
        date == null ? await _db.allShiftEvents() : await _db.shiftEventsForDate(date);
    return rows.map(_event).toList(growable: false);
  }

  Future<ScheduleEvent?> event(String id) async {
    final ShiftEventRow? row = await _db.shiftEventById(id);
    return row == null ? null : _event(row);
  }

  /// Время последней записи смен — «Данные от {HH:mm}» на `/today` и `/route`.
  Future<DateTime?> eventsUpdatedAt({String? date}) async {
    final List<ShiftEventRow> rows =
        date == null ? await _db.allShiftEvents() : await _db.shiftEventsForDate(date);
    return _latest(rows.map((ShiftEventRow row) => row.updatedAt));
  }

  // ------------------------------------------------------------- объекты

  Future<void> saveObject(ObjectSummary object, {DateTime? at}) {
    return _db.upsertObjects(<CachedObjectsCompanion>[
      CachedObjectsCompanion(
        id: Value<String>(object.id),
        name: Value<String>(object.name),
        address: Value<String?>(object.address),
        lat: Value<double?>(object.lat),
        lng: Value<double?>(object.lng),
        status: Value<String?>(object.status),
        updatedAt: Value<DateTime>(at ?? DateTime.now()),
      ),
    ]);
  }

  Future<ObjectSummary?> object(String id) async {
    final CachedObjectRow? row = await _db.cachedObjectById(id);
    if (row == null) return null;
    return ObjectSummary(
      id: row.id,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      status: row.status,
    );
  }

  // ------------------------------------------------------------- маршрут

  /// Точки маршрута и помещения одной записью: `/route` без сети берёт их отсюда.
  Future<void> saveRoute({
    required String eventId,
    required RouteDetail route,
    DateTime? at,
  }) async {
    await _db.upsertRoutePoints(
      route.points
          .map(
            (RoutePointView point) => RoutePointsCompanion(
              pointId: Value<String>(point.id),
              eventId: Value<String>(eventId),
              routeId: Value<String>(route.id),
              roomId: Value<String>(point.roomId),
              orderIndex: Value<int>(point.orderIndex),
              estimatedTimeMin: Value<int?>(point.estimatedTimeMin),
              status: const Value<String>('pending'),
            ),
          )
          .toList(growable: false),
    );
    await saveRooms(
      route.points
          .map(
            (RoutePointView point) => CachedRoomInput(
              id: point.roomId,
              floorId: point.floorId ?? route.floorId,
              name: point.title,
              coordsX: point.coordsX,
              coordsY: point.coordsY,
              coordsWidth: point.coordsWidth,
              coordsHeight: point.coordsHeight,
            ),
          )
          .toList(growable: false),
    );
  }

  /// Маршрут из кэша: имя маршрута в §3 не кэшируется (замечание в отчёте),
  /// поэтому оно пустое, а время считается по точкам.
  Future<RouteDetail?> route(String eventId) async {
    final List<RoutePointView> points = await routePoints(eventId);
    if (points.isEmpty) return null;
    final List<RoutePointRow> rows = await _db.routePointsForEvent(eventId);
    return RouteDetail(
      id: rows.first.routeId,
      name: '',
      status: 'ACTIVE',
      floorId: points.first.floorId,
      points: points,
      totalEstimatedTimeMin: points.fold<int>(
        0,
        (int sum, RoutePointView point) => sum + (point.estimatedTimeMin ?? 0),
      ),
    );
  }

  Future<List<RoutePointView>> routePoints(String eventId) async {
    final List<RoutePointRow> rows = await _db.routePointsForEvent(eventId);
    if (rows.isEmpty) return const <RoutePointView>[];
    final Map<String, CachedRoomRow> rooms = <String, CachedRoomRow>{
      for (final CachedRoomRow room
          in await _db.cachedRoomsByIds(rows.map((RoutePointRow row) => row.roomId).toList()))
        room.id: room,
    };
    return rows.map((RoutePointRow row) {
      final CachedRoomRow? room = rooms[row.roomId];
      return RoutePointView(
        id: row.pointId,
        roomId: row.roomId,
        orderIndex: row.orderIndex,
        roomName: room?.name,
        floorId: room?.floorId,
        coordsX: room?.coordsX,
        coordsY: room?.coordsY,
        coordsWidth: room?.coordsWidth,
        coordsHeight: room?.coordsHeight,
        estimatedTimeMin: row.estimatedTimeMin,
      );
    }).toList(growable: false);
  }

  /// Локальный статус точки: прогресс маршрута переживает перезапуск и оффлайн.
  Future<void> saveRoutePointStatus({
    required String pointId,
    required RoutePointStatus status,
    String? skippedReason,
    DateTime? completedAtLocal,
  }) {
    return _db.updateRoutePointStatus(
      pointId,
      status: status.code,
      skippedReason: skippedReason,
      completedAtLocal: completedAtLocal,
    );
  }

  /// Статусы точек маршрута из кэша: `pointId` → код статуса.
  Future<Map<String, RoutePointStatus>> routePointStatuses(String eventId) async {
    final List<RoutePointRow> rows = await _db.routePointsForEvent(eventId);
    return <String, RoutePointStatus>{
      for (final RoutePointRow row in rows) row.pointId: RoutePointStatus.of(row.status),
    };
  }

  // ------------------------------------------------------------- помещения

  /// Помещение из `GET /api/rooms/:id`: техкарта и заголовок чек-листа.
  Future<void> saveRoom(RoomDetail room) {
    return saveRooms(<CachedRoomInput>[
      CachedRoomInput(
        id: room.id,
        floorId: room.floorId,
        name: room.name,
        techCardId: room.techCardId,
        floorType: room.floorType,
        zone: room.zone,
      ),
    ]);
  }

  Future<RoomDetail?> room(String id) async {
    final CachedRoomRow? row = await _db.cachedRoomById(id);
    if (row == null) return null;
    return RoomDetail(
      id: row.id,
      name: row.name,
      floorId: row.floorId,
      techCardId: row.techCardId,
      floorType: row.floorType,
      zone: row.zone,
    );
  }

  /// Запись помещений с сохранением уже известных полей.
  ///
  /// Помещение приходит из двух источников: из маршрута (координаты и название) и
  /// из `GET /api/rooms/:id` (техкарта). Второй ответ не должен стирать первый,
  /// поэтому пустые поля не перезаписывают непустые.
  ///
  /// `areaM2`, `floorType` и `zone` из §3 в кэше есть, но заполнить их нечем:
  /// ни `RoomDetail`, ни `RoutePointView` этих полей не разбирают (замечание в отчёте).
  Future<void> saveRooms(List<CachedRoomInput> rooms) async {
    final List<CachedRoomsCompanion> rows = <CachedRoomsCompanion>[];
    for (final CachedRoomInput room in rooms) {
      final CachedRoomRow? existing = await _db.cachedRoomById(room.id);
      rows.add(
        CachedRoomsCompanion(
          id: Value<String>(room.id),
          floorId: Value<String?>(room.floorId ?? existing?.floorId),
          name: Value<String>(_nonEmpty(room.name) ?? existing?.name ?? 'Помещение'),
          areaM2: Value<double?>(existing?.areaM2),
          floorType: Value<String?>(room.floorType ?? existing?.floorType),
          zone: Value<String?>(room.zone ?? existing?.zone),
          techCardId: Value<String?>(room.techCardId ?? existing?.techCardId),
          coordsX: Value<int?>(room.coordsX ?? existing?.coordsX),
          coordsY: Value<int?>(room.coordsY ?? existing?.coordsY),
          coordsWidth: Value<int?>(room.coordsWidth ?? existing?.coordsWidth),
          coordsHeight: Value<int?>(room.coordsHeight ?? existing?.coordsHeight),
        ),
      );
    }
    await _db.upsertRooms(rows);
  }

  // ------------------------------------------------------------- техкарты

  Future<void> saveTechCard(TechCardDetail card, {DateTime? at}) {
    return _db.upsertTechCard(
      CachedTechCardsCompanion(
        id: Value<String>(card.id),
        name: Value<String>(card.name),
        operationsJson: Value<String>(
          jsonEncode(
            card.operations.map((TechOperation op) => op.toJson()).toList(growable: false),
          ),
        ),
        totalEstimatedTimeMin: Value<int>(card.totalEstimatedTimeMin),
        updatedAt: Value<DateTime>(at ?? DateTime.now()),
      ),
    );
  }

  Future<TechCardDetail?> techCard(String id) async {
    final CachedTechCardRow? row = await _db.cachedTechCardById(id);
    if (row == null) return null;
    final List<TechOperation> operations = TechOperation.listFrom(_decodeList(row.operationsJson));
    return TechCardDetail(
      id: row.id,
      name: row.name,
      operations: operations,
      totalEstimatedTimeMin: row.totalEstimatedTimeMin,
    );
  }

  // ------------------------------------------------------------- заявки

  Future<void> saveTickets(List<TicketSummary> tickets, {DateTime? at}) {
    final DateTime stamp = at ?? DateTime.now();
    return _db.upsertTickets(
      tickets
          .map(
            (TicketSummary ticket) => CachedTicketsCompanion(
              id: Value<String>(ticket.id),
              type: Value<String>(ticket.type),
              priority: Value<String>(ticket.priority),
              status: Value<String>(ticket.status),
              description: Value<String?>(ticket.description),
              roomId: Value<String?>(ticket.roomId),
              completionDeadline: Value<String?>(ticket.completionDeadline),
              operationsCompleted: Value<int?>(ticket.operationsCompleted),
              updatedAt: Value<DateTime>(stamp),
            ),
          )
          .toList(growable: false),
    );
  }

  Future<List<TicketSummary>> tickets() async {
    final List<CachedTicketRow> rows = await _db.allCachedTickets();
    return rows
        .map(
          (CachedTicketRow row) => TicketSummary(
            id: row.id,
            status: row.status,
            type: row.type,
            priority: row.priority,
            description: row.description ?? '',
            roomId: row.roomId,
            completionDeadline: row.completionDeadline,
            operationsCompleted: row.operationsCompleted,
          ),
        )
        .toList(growable: false);
  }

  // ------------------------------------------------------------- операции чек-листа

  Future<void> saveOperations({
    required String roomId,
    String? ticketId,
    required List<CachedOperation> operations,
  }) {
    return _db.upsertChecklistOperations(
      operations
          .map(
            (CachedOperation cached) => ChecklistOperationsCompanion(
              operationId: Value<String>(cached.operation.id),
              roomId: Value<String>(roomId),
              ticketId: Value<String?>(ticketId),
              orderIndex: Value<int>(cached.operation.orderIndex),
              name: Value<String>(cached.operation.name),
              description: Value<String?>(cached.operation.description),
              equipmentJson: Value<String?>(
                cached.operation.equipment.isEmpty ? null : jsonEncode(cached.operation.equipment),
              ),
              estimatedTimeMin: Value<int?>(cached.operation.estimatedTimeMin),
              requiresPhoto: Value<bool>(cached.operation.requiresPhoto),
              requiresQr: Value<bool>(cached.operation.requiresQr),
              startedAtLocal: Value<DateTime?>(cached.startedAtLocal),
              completedAtLocal: Value<DateTime?>(cached.completedAtLocal),
              photoLocalPath: Value<String?>(cached.photoLocalPath),
              photoFileId: Value<String?>(cached.photoFileId),
              photoUrl: Value<String?>(cached.photoUrl),
              syncStatus: Value<String>(cached.status),
            ),
          )
          .toList(growable: false),
    );
  }

  Future<List<CachedOperation>> operations(String roomId) async {
    final List<ChecklistOperationRow> rows = await _db.checklistOperationsForRoom(roomId);
    return rows
        .map(
          (ChecklistOperationRow row) => CachedOperation(
            operation: TechOperation(
              id: row.operationId,
              name: row.name,
              orderIndex: row.orderIndex,
              estimatedTimeMin: row.estimatedTimeMin ?? 1,
              description: row.description,
              equipment: _decodeEquipment(row.equipmentJson),
              requiresPhoto: row.requiresPhoto,
              requiresQr: row.requiresQr,
            ),
            status: row.syncStatus,
            startedAtLocal: row.startedAtLocal,
            completedAtLocal: row.completedAtLocal,
            photoLocalPath: row.photoLocalPath,
            photoFileId: row.photoFileId,
            photoUrl: row.photoUrl,
          ),
        )
        .toList(growable: false);
  }

  // ------------------------------------------------------------- обслуживание

  /// Время последней записи кэша — «Данные от {HH:mm}» (DS-002 §2).
  Future<DateTime?> lastUpdatedAt() => _db.lastCacheUpdatedAt();

  /// Кэш пуст: экрану нечего показать без сети (DS-002 §7).
  Future<bool> isEmpty() async => await _db.cachedRowsCount() == 0;

  ScheduleEvent _event(ShiftEventRow row) {
    return ScheduleEvent(
      id: row.id,
      scheduleId: row.scheduleId,
      scheduleName: row.scheduleName,
      objectId: row.objectId,
      routeId: row.routeId,
      date: row.date ?? '',
      plannedStart: row.plannedStart ?? '',
      status: row.status,
      ticketId: row.ticketId,
      checkOutReason: row.checkOutReason,
    );
  }

  static String? _nonEmpty(String? value) =>
      value == null || value.trim().isEmpty ? null : value;

  /// Самое позднее время из набора: время записи показанных данных.
  static DateTime? _latest(Iterable<DateTime> values) {
    DateTime? latest;
    for (final DateTime value in values) {
      if (latest == null || value.isAfter(latest)) latest = value;
    }
    return latest;
  }

  static List<dynamic> _decodeList(String raw) {
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is List) return decoded;
    } on FormatException {
      // Битая строка кэша не должна ронять экран: покажем пустую техкарту.
    }
    return const <dynamic>[];
  }

  static Map<String, dynamic> _decodeEquipment(String? raw) {
    if (raw == null || raw.isEmpty) return const <String, dynamic>{};
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is Map) {
        return decoded.map(
          (dynamic key, dynamic value) => MapEntry<String, dynamic>(key.toString(), value),
        );
      }
    } on FormatException {
      // См. выше: повреждённый кэш деградирует, а не падает.
    }
    return const <String, dynamic>{};
  }
}

/// Помещение для записи в кэш: поля приходят из разных ответов сервера.
class CachedRoomInput {
  const CachedRoomInput({
    required this.id,
    required this.name,
    this.floorId,
    this.techCardId,
    this.coordsX,
    this.coordsY,
    this.coordsWidth,
    this.coordsHeight,
    this.floorType,
    this.zone,
  });

  final String id;
  final String name;
  final String? floorId;
  final String? techCardId;
  final String? floorType;
  final String? zone;
  final int? coordsX;
  final int? coordsY;
  final int? coordsWidth;
  final int? coordsHeight;
}
