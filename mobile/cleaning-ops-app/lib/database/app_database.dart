import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Очередь действий оператора: то, что сделано без сети (DS-002 `offline.md` §3).
///
/// Имя класса данных задано явно (`PendingActionRow`), чтобы не конфликтовать с
/// доменной моделью `PendingAction` из `shared/data/pending_actions.dart`.
@DataClassName('PendingActionRow')
class PendingActions extends Table {
  /// Локальный uuid v4 — он же ключ интерфейса.
  TextColumn get id => text()();

  /// `kind`: `sos`, `operation_completed`, `sos_attach_photo` (`PendingActionTypes`).
  TextColumn get kind => text()();

  /// Полезная нагрузка действия (JSON), см. DS-002 §4.2.
  TextColumn get payloadJson => text()();

  /// Ключ идемпотентности: `op:<ticketId>:<operationId>`, `sos:<clientRequestId>`.
  TextColumn get idempotencyKey => text().nullable()();

  /// `pending` | `sending` | `failed` | `synced`.
  TextColumn get status => text().withDefault(const Constant('pending'))();

  IntColumn get attempts => integer().withDefault(const Constant(0))();

  TextColumn get lastError => text().nullable()();

  /// Время следующей попытки (экспоненциальная задержка).
  DateTimeColumn get nextAttemptAt => dateTime().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  DateTimeColumn get syncedAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Буфер GPS-точек (М6.6): точка пишется сразу, уходит батчами в `POST /api/gps/track`.
@DataClassName('GpsPointRow')
class GpsPoints extends Table {
  IntColumn get id => integer().autoIncrement()();
  RealColumn get lat => real()();
  RealColumn get lng => real()();
  RealColumn get accuracy => real().nullable()();

  /// Скорость, м/с — по ней выбирается интервал отправки (в движении короче).
  RealColumn get speed => real().nullable()();

  /// Заряд батареи, %: в стеке устава нет плагина батареи, поле может быть `null`.
  IntColumn get battery => integer().nullable()();

  /// Время фиксации точки (ISO в API, здесь — локальное время).
  DateTimeColumn get timestamp => dateTime()();

  /// Точка уже ушла на сервер.
  BoolColumn get synced => boolean().withDefault(const Constant(false))();
}

/// Кэш смен оператора (DS-002 `offline.md` §3): из него рисуются `/today`, `/route`
/// и чек-лист, когда сети нет.
///
/// Время записи строки — `updatedAt`: по нему экран показывает «Данные от {HH:mm}».
/// Полей `checkInAt`/`checkOutAt` в спецификации нет — см. замечание в отчёте.
@DataClassName('ShiftEventRow')
class ShiftEvents extends Table {
  TextColumn get id => text()();
  TextColumn get scheduleId => text().nullable()();
  TextColumn get scheduleName => text()();
  TextColumn get objectId => text().nullable()();
  TextColumn get routeId => text().nullable()();
  TextColumn get date => text().nullable()();
  TextColumn get plannedStart => text().nullable()();
  TextColumn get status => text()();
  TextColumn get ticketId => text().nullable()();
  TextColumn get checkOutReason => text().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Кэш объектов: название в шапке `/today` и `objectName` для аварийной заявки.
@DataClassName('CachedObjectRow')
class CachedObjects extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get address => text().nullable()();
  RealColumn get lat => real().nullable()();
  RealColumn get lng => real().nullable()();
  TextColumn get status => text().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Кэш точек маршрута: прогресс (`status`) и время завершения переживают оффлайн.
@DataClassName('RoutePointRow')
class RoutePoints extends Table {
  TextColumn get pointId => text()();
  TextColumn get eventId => text()();
  TextColumn get routeId => text()();
  TextColumn get roomId => text()();
  IntColumn get orderIndex => integer().withDefault(const Constant(0))();
  IntColumn get estimatedTimeMin => integer().nullable()();

  /// `pending` | `active` | `done` | `skipped`.
  TextColumn get status => text().withDefault(const Constant('pending'))();
  TextColumn get skippedReason => text().nullable()();
  DateTimeColumn get completedAtLocal => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{pointId};
}

/// Кэш операций чек-листа: таймеры, фото до отправки и статус синхронизации.
@DataClassName('ChecklistOperationRow')
class ChecklistOperations extends Table {
  TextColumn get operationId => text()();
  TextColumn get roomId => text()();
  TextColumn get ticketId => text().nullable()();
  IntColumn get orderIndex => integer().withDefault(const Constant(0))();
  TextColumn get name => text()();
  TextColumn get description => text().nullable()();
  TextColumn get equipmentJson => text().nullable()();
  IntColumn get estimatedTimeMin => integer().nullable()();
  BoolColumn get requiresPhoto => boolean().withDefault(const Constant(false))();
  BoolColumn get requiresQr => boolean().withDefault(const Constant(false))();
  DateTimeColumn get startedAtLocal => dateTime().nullable()();
  DateTimeColumn get completedAtLocal => dateTime().nullable()();
  TextColumn get photoLocalPath => text().nullable()();
  TextColumn get photoFileId => text().nullable()();
  TextColumn get photoUrl => text().nullable()();

  /// Локальный статус операции: `pending` | `active` | `completed` | `queued`.
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{operationId};
}

/// Кэш помещений: координаты маркеров на плане и заголовок чек-листа.
@DataClassName('CachedRoomRow')
class CachedRooms extends Table {
  TextColumn get id => text()();
  TextColumn get floorId => text().nullable()();
  TextColumn get name => text()();
  RealColumn get areaM2 => real().nullable()();
  TextColumn get floorType => text().nullable()();
  TextColumn get zone => text().nullable()();
  TextColumn get techCardId => text().nullable()();
  IntColumn get coordsX => integer().nullable()();
  IntColumn get coordsY => integer().nullable()();
  IntColumn get coordsWidth => integer().nullable()();
  IntColumn get coordsHeight => integer().nullable()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Кэш техкарт: операции чек-листа без сети (в API-форме — `operationsJson`).
@DataClassName('CachedTechCardRow')
class CachedTechCards extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get operationsJson => text()();
  IntColumn get totalEstimatedTimeMin => integer().withDefault(const Constant(0))();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Кэш заявок оператора: блок «Мои заявки» и прогресс операций.
@DataClassName('CachedTicketRow')
class CachedTickets extends Table {
  TextColumn get id => text()();
  TextColumn get type => text()();
  TextColumn get priority => text()();
  TextColumn get status => text()();
  TextColumn get description => text().nullable()();
  TextColumn get roomId => text().nullable()();
  TextColumn get completionDeadline => text().nullable()();
  IntColumn get operationsCompleted => integer().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Лента чата с оффлайн-сообщениями (DS-002 `offline.md` §3, М6.8).
///
/// Ключ — локальный `clientId`: своего id у сообщения до ответа сервера нет, а
/// показать пузырь «Отправляется…» нужно сразу. Когда сервер подтверждает
/// отправку, в `serverId` ложится настоящий id, а `status` меняется на `sent`
/// (`read` — после события `message:read`).
@DataClassName('ChatMessageRow')
class ChatMessages extends Table {
  /// Локальный идентификатор клиента (он же `clientMessageId` для дедупликации).
  TextColumn get clientId => text()();

  /// `MessageView.id` сервера; `null`, пока сообщение не подтверждено.
  TextColumn get serverId => text().nullable()();

  TextColumn get chatId => text()();

  /// Автор сообщения: по нему свои пузыри отличаются от входящих.
  TextColumn get authorId => text().nullable()();

  /// Текст сообщения. Геттер назван `messageText`, а колонка — `text`
  /// (`.named('text')`): имя `text` конфликтует с билдером `text()` самого drift.
  TextColumn get messageText => text().named('text')();

  /// `attachmentIds` в JSON: список id файлов file-service.
  TextColumn get attachmentIdsJson => text().nullable()();

  DateTimeColumn get createdAtLocal => dateTime()();

  /// `pending` | `sent` | `read` | `failed` (DS-002 `offline.md` §3).
  TextColumn get status => text().withDefault(const Constant('pending'))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{clientId};
}

/// Локальная база приложения (drift/SQLite).
@DriftDatabase(
  tables: <Type>[
    PendingActions,
    GpsPoints,
    ShiftEvents,
    CachedObjects,
    RoutePoints,
    ChecklistOperations,
    CachedRooms,
    CachedTechCards,
    CachedTickets,
    ChatMessages,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// База в памяти: тесты и любой сценарий без файла на диске.
  AppDatabase.memory() : super(NativeDatabase.memory());

  @override
  int get schemaVersion => 3;

  /// Миграции: v1 → v2 (М6.7) — таблицы кэша чтения, v2 → v3 (М6.8) — лента чата.
  ///
  /// `pending_actions`, `gps_points` и `chat_messages` не пересоздаются: в них
  /// лежат данные оператора (очередь действий, буфер GPS, неотправленные
  /// сообщения) — они обязаны пережить обновление приложения.
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async => m.createAll(),
        onUpgrade: (Migrator m, int from, int to) async {
          if (from < 2) {
            await m.createTable(shiftEvents);
            await m.createTable(cachedObjects);
            await m.createTable(routePoints);
            await m.createTable(checklistOperations);
            await m.createTable(cachedRooms);
            await m.createTable(cachedTechCards);
            await m.createTable(cachedTickets);
          }
          if (from < 3) {
            await m.createTable(chatMessages);
          }
        },
      );

  // ------------------------------------------------------------- очередь

  /// Сколько действий ещё не ушло на сервер (`pending` + `sending` + `failed`).
  Future<int> outgoingCount() async {
    final Expression<bool> outgoing = pendingActions.status.equals('pending') |
        pendingActions.status.equals('sending') |
        pendingActions.status.equals('failed');
    final Expression<int> total = pendingActions.id.count();
    final TypedResult row =
        await (selectOnly(pendingActions)..addColumns(<Expression<Object>>[total])..where(outgoing))
            .getSingle();
    return row.read(total) ?? 0;
  }

  /// Записи, готовые к отправке: `pending` и время попытки наступило.
  ///
  /// Сортировка — по приоритету вида действия, затем FIFO по времени создания
  /// (DS-002 `offline.md` §5.2). Приоритет задан в Dart-коде очереди, потому что
  /// он продуктовый, а не свойство строки.
  Future<List<PendingActionRow>> pendingRows(DateTime now) {
    return (select(pendingActions)
          ..where((PendingActions t) => t.status.equals('pending'))
          ..where(
            (PendingActions t) =>
                t.nextAttemptAt.isNull() | t.nextAttemptAt.isSmallerOrEqualValue(now),
          )
          ..orderBy(<OrderClauseGenerator<PendingActions>>[
            (PendingActions t) => OrderingTerm.asc(t.createdAt),
          ]))
        .get();
  }

  Future<List<PendingActionRow>> allRows() {
    return (select(pendingActions)
          ..orderBy(<OrderClauseGenerator<PendingActions>>[
            (PendingActions t) => OrderingTerm.asc(t.createdAt),
          ]))
        .get();
  }

  Future<PendingActionRow?> rowById(String id) {
    return (select(pendingActions)..where((PendingActions t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<void> insertAction(PendingActionsCompanion row) => into(pendingActions).insert(row);

  Future<void> updateAction(String id, PendingActionsCompanion row) {
    return (update(pendingActions)..where((PendingActions t) => t.id.equals(id))).write(row);
  }

  Future<void> deleteAction(String id) {
    return (delete(pendingActions)..where((PendingActions t) => t.id.equals(id))).go();
  }

  // ------------------------------------------------------------- GPS-буфер

  Future<void> insertGpsPoint(GpsPointsCompanion point) => into(gpsPoints).insert(point);

  /// Неотправленные точки в порядке фиксации — их забирает батч М6.6.
  Future<List<GpsPointRow>> unsyncedGpsPoints({int limit = 1000}) {
    return (select(gpsPoints)
          ..where((GpsPoints t) => t.synced.equals(false))
          ..orderBy(<OrderClauseGenerator<GpsPoints>>[
            (GpsPoints t) => OrderingTerm.asc(t.timestamp),
          ])
          ..limit(limit))
        .get();
  }

  Future<int> unsyncedGpsCount() async {
    final Expression<int> total = gpsPoints.id.count();
    final TypedResult row = await (selectOnly(gpsPoints)
          ..addColumns(<Expression<Object>>[total])
          ..where(gpsPoints.synced.equals(false)))
        .getSingle();
    return row.read(total) ?? 0;
  }

  Future<void> markGpsPointsSynced(List<int> ids) async {
    if (ids.isEmpty) return;
    await (update(gpsPoints)..where((GpsPoints t) => t.id.isIn(ids)))
        .write(const GpsPointsCompanion(synced: Value<bool>(true)));
  }

  Future<void> deleteGpsPoints(List<int> ids) async {
    if (ids.isEmpty) return;
    await (delete(gpsPoints)..where((GpsPoints t) => t.id.isIn(ids))).go();
  }
}

/// Файл базы в каталоге приложения: `cleaning_ops.sqlite`.
///
/// `LazyDatabase` открывает файл при первом запросе, а не при создании
/// провайдера: экраны, которым очередь не нужна, не платят за открытие БД.
QueryExecutor openAppDatabaseConnection() {
  return LazyDatabase(() async {
    final Directory dir = await getApplicationDocumentsDirectory();
    final File file = File('${dir.path}/$appDatabaseFileName');
    return NativeDatabase.createInBackground(file);
  });
}

/// Имя файла базы: по нему считается «Размер кэша» в профиле (`profile.md` §3.5).
const String appDatabaseFileName = 'cleaning_ops.sqlite';
