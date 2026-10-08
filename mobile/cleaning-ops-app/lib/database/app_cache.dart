import 'package:drift/drift.dart';

import 'app_database.dart';

/// Низкоуровневый доступ к таблицам кэша чтения (DS-002 `offline.md` §3).
///
/// Таблицы описаны в [AppDatabase]; здесь — только операции над ними. Очередь
/// действий (`pending_actions`) и буфер GPS (`gps_points`) сюда не входят: их
/// владелец — М6.6/М6.7, и очистка кэша их не касается (`profile.md` п. 11.7).
extension AppCacheQueries on AppDatabase {
  // ------------------------------------------------------------- смены

  /// Запись смен: экран `/today` и маршрут читают их без сети.
  Future<void> upsertShiftEvents(List<ShiftEventsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(shiftEvents, rows));
  }

  Future<List<ShiftEventRow>> allShiftEvents() {
    return (select(shiftEvents)
          ..orderBy(<OrderClauseGenerator<ShiftEvents>>[
            (ShiftEvents t) => OrderingTerm.asc(t.plannedStart),
          ]))
        .get();
  }

  Future<List<ShiftEventRow>> shiftEventsForDate(String date) {
    return (select(shiftEvents)
          ..where((ShiftEvents t) => t.date.equals(date))
          ..orderBy(<OrderClauseGenerator<ShiftEvents>>[
            (ShiftEvents t) => OrderingTerm.asc(t.plannedStart),
          ]))
        .get();
  }

  Future<ShiftEventRow?> shiftEventById(String id) {
    return (select(shiftEvents)..where((ShiftEvents t) => t.id.equals(id))).getSingleOrNull();
  }

  /// Смена изменилась на сервере (check-in/check-out): кэш обновляется сразу,
  /// чтобы экран не показывал старый статус до ответа сети.
  Future<void> updateShiftEventStatus(
    String id, {
    required String status,
    String? checkOutReason,
    DateTime? at,
  }) {
    return (update(shiftEvents)..where((ShiftEvents t) => t.id.equals(id))).write(
      ShiftEventsCompanion(
        status: Value<String>(status),
        checkOutReason: Value<String?>(checkOutReason),
        updatedAt: Value<DateTime>(at ?? DateTime.now()),
      ),
    );
  }

  // ------------------------------------------------------------- объекты

  Future<void> upsertObjects(List<CachedObjectsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(cachedObjects, rows));
  }

  Future<CachedObjectRow?> cachedObjectById(String id) {
    return (select(cachedObjects)..where((CachedObjects t) => t.id.equals(id))).getSingleOrNull();
  }

  // ------------------------------------------------------------- точки маршрута

  Future<void> upsertRoutePoints(List<RoutePointsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(routePoints, rows));
  }

  Future<List<RoutePointRow>> routePointsForEvent(String eventId) {
    return (select(routePoints)
          ..where((RoutePoints t) => t.eventId.equals(eventId))
          ..orderBy(<OrderClauseGenerator<RoutePoints>>[
            (RoutePoints t) => OrderingTerm.asc(t.orderIndex),
          ]))
        .get();
  }

  /// Локальный прогресс точки: обновляется при завершении и пропуске.
  Future<void> updateRoutePointStatus(
    String pointId, {
    required String status,
    String? skippedReason,
    DateTime? completedAtLocal,
  }) {
    return (update(routePoints)..where((RoutePoints t) => t.pointId.equals(pointId))).write(
      RoutePointsCompanion(
        status: Value<String>(status),
        skippedReason: Value<String?>(skippedReason),
        completedAtLocal: Value<DateTime?>(completedAtLocal),
      ),
    );
  }

  // ------------------------------------------------------------- операции чек-листа

  Future<void> upsertChecklistOperations(List<ChecklistOperationsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(checklistOperations, rows));
  }

  Future<List<ChecklistOperationRow>> checklistOperationsForRoom(String roomId) {
    return (select(checklistOperations)
          ..where((ChecklistOperations t) => t.roomId.equals(roomId))
          ..orderBy(<OrderClauseGenerator<ChecklistOperations>>[
            (ChecklistOperations t) => OrderingTerm.asc(t.orderIndex),
          ]))
        .get();
  }

  // ------------------------------------------------------------- помещения

  Future<void> upsertRooms(List<CachedRoomsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(cachedRooms, rows));
  }

  Future<CachedRoomRow?> cachedRoomById(String id) {
    return (select(cachedRooms)..where((CachedRooms t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<List<CachedRoomRow>> cachedRoomsByIds(List<String> ids) {
    if (ids.isEmpty) return Future<List<CachedRoomRow>>.value(const <CachedRoomRow>[]);
    return (select(cachedRooms)..where((CachedRooms t) => t.id.isIn(ids))).get();
  }

  // ------------------------------------------------------------- техкарты

  Future<void> upsertTechCard(CachedTechCardsCompanion row) =>
      into(cachedTechCards).insertOnConflictUpdate(row);

  Future<CachedTechCardRow?> cachedTechCardById(String id) {
    return (select(cachedTechCards)..where((CachedTechCards t) => t.id.equals(id))).getSingleOrNull();
  }

  // ------------------------------------------------------------- заявки

  Future<void> upsertTickets(List<CachedTicketsCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((Batch batch) => batch.insertAllOnConflictUpdate(cachedTickets, rows));
  }

  Future<List<CachedTicketRow>> allCachedTickets() {
    return (select(cachedTickets)
          ..orderBy(<OrderClauseGenerator<CachedTickets>>[
            (CachedTickets t) => OrderingTerm.desc(t.updatedAt),
          ]))
        .get();
  }

  // ------------------------------------------------------------- обслуживание

  /// Сколько строк лежит в таблицах кэша (тесты и диагностика).
  Future<int> cachedRowsCount() async {
    int total = 0;
    for (final TableInfo<Table, dynamic> table in <TableInfo<Table, dynamic>>[
      shiftEvents,
      cachedObjects,
      routePoints,
      checklistOperations,
      cachedRooms,
      cachedTechCards,
      cachedTickets,
    ]) {
      final Expression<int> count = table.$columns.first.count();
      final TypedResult row =
          await (selectOnly(table)..addColumns(<Expression<Object>>[count])).getSingle();
      total += row.read(count) ?? 0;
    }
    return total;
  }

  /// Очистка кэша чтения. Очередь действий и GPS-буфер **не** трогаются:
  /// в них лежат данные оператора (`profile.md` §11.7).
  Future<void> clearCachedTables() {
    return batch((Batch batch) {
      batch.deleteAll(shiftEvents);
      batch.deleteAll(cachedObjects);
      batch.deleteAll(routePoints);
      batch.deleteAll(checklistOperations);
      batch.deleteAll(cachedRooms);
      batch.deleteAll(cachedTechCards);
      batch.deleteAll(cachedTickets);
    });
  }

  /// Полная очистка данных пользователя при выходе (`profile.md` §3.5:
  /// «очистка drift (все таблицы)»): кэш чтения, очередь действий, GPS-буфер и
  /// лента чата. Диалог выхода предупреждает, что неотправленное будет потеряно.
  Future<void> clearUserData() {
    return batch((Batch batch) {
      for (final TableInfo<Table, dynamic> table in allTables) {
        batch.deleteAll(table);
      }
    });
  }

  /// Смены «на сегодня» целиком: строки, которых нет в ответе сервера (смены
  /// прежнего пользователя или снятые с графика), из кэша уходят.
  Future<void> replaceShiftEvents(List<ShiftEventsCompanion> rows) {
    return batch((Batch batch) {
      batch.deleteAll(shiftEvents);
      batch.insertAllOnConflictUpdate(shiftEvents, rows);
    });
  }

  /// Заявки оператора целиком — по тому же правилу, что [replaceShiftEvents].
  Future<void> replaceTickets(List<CachedTicketsCompanion> rows) {
    return batch((Batch batch) {
      batch.deleteAll(cachedTickets);
      batch.insertAllOnConflictUpdate(cachedTickets, rows);
    });
  }

  /// Самое свежее время записи кэша: «Данные от {HH:mm}» на экранах.
  Future<DateTime?> lastCacheUpdatedAt() async {
    final List<DateTime?> stamps = <DateTime?>[
      ...(await allShiftEvents()).map((ShiftEventRow row) => row.updatedAt),
      ...(await allCachedTickets()).map((CachedTicketRow row) => row.updatedAt),
    ];
    stamps.removeWhere((DateTime? value) => value == null);
    if (stamps.isEmpty) return null;
    stamps.sort((DateTime? a, DateTime? b) => b!.compareTo(a!));
    return stamps.first;
  }

  /// Счётчик неотправленного для `AppBar` (DS-002 §2): меняется сам, как только
  /// синхронизация переводит запись в `synced`.
  Stream<int> watchOutgoingCount() {
    final Expression<int> total = pendingActions.id.count();
    final Selectable<TypedResult> query = selectOnly(pendingActions)
      ..addColumns(<Expression<Object>>[total])
      ..where(pendingActions.status.isIn(const <String>['pending', 'sending', 'failed']));
    return query.map((TypedResult row) => row.read(total) ?? 0).watchSingle();
  }
}
