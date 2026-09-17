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

/// Локальная база приложения (drift/SQLite).
@DriftDatabase(tables: <Type>[PendingActions, GpsPoints])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// База в памяти: тесты и любой сценарий без файла на диске.
  AppDatabase.memory() : super(NativeDatabase.memory());

  @override
  int get schemaVersion => 1;

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
    final File file = File('${dir.path}/cleaning_ops.sqlite');
    return NativeDatabase.createInBackground(file);
  });
}
