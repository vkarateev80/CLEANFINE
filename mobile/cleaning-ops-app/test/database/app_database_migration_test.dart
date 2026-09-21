import 'package:cleaning_ops_app/database/app_cache.dart';
import 'package:cleaning_ops_app/database/app_chat_messages.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/drift_pending_action_queue.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
// `isNull`/`isNotNull` у drift — SQL-выражения, а не матчеры теста.
import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// М6.7 — миграция `v1 → v2`, М6.8 — `v2 → v3` (DS-002 `offline.md` §3).
///
/// Главный риск правки — сохранность данных оператора: `pending_actions` (очередь
/// действий), `gps_points` (буфер GPS) и `chat_messages` (неотправленные
/// сообщения чата) обновление обязано **не потерять**, а таблицы кэша чтения —
/// не пересоздать. Тест собирает базу предыдущей версии из того же SQL, который
/// генерирует drift, пишет в неё данные в том же виде, в каком их хранит drift,
/// ставит `user_version` и открывает поверх обычный `AppDatabase` — то есть
/// проходит настоящий путь `onUpgrade`, а не только «таблицы создались».
void main() {
  final DateTime base = DateTime(2026, 9, 16, 10, 0);

  /// Схема v1: SQL двух таблиц, снятый с живой базы drift.
  Future<List<String>> v1Schema(AppDatabase reference) async {
    final List<QueryRow> rows = await reference
        .customSelect(
          "SELECT sql FROM sqlite_master WHERE type = 'table' "
          "AND name IN ('pending_actions', 'gps_points') ORDER BY name",
        )
        .get();
    return rows.map((QueryRow row) => row.read<String>('sql')).toList(growable: false);
  }

  /// База версии 1 с данными оператора: очередь на 2 попытки и две GPS-точки.
  Future<AppDatabase> openV1WithData() async {
    // 1. Эталон: значения пишет сам drift — формат хранения миграция не меняет.
    final AppDatabase reference = AppDatabase.memory();
    await reference.insertAction(
      PendingActionsCompanion.insert(
        id: '5f1c0f4e-queue-1',
        kind: PendingActionTypes.operationCompleted,
        payloadJson: '{"ticketId":"ticket-1","operationId":"op1"}',
        idempotencyKey: const Value<String>('op:ticket-1:op1'),
        status: const Value<String>('failed'),
        attempts: const Value<int>(2),
        lastError: const Value<String>('Нет соединения'),
        nextAttemptAt: Value<DateTime?>(base.add(const Duration(seconds: 30))),
        createdAt: base,
      ),
    );
    await reference.insertGpsPoint(
      GpsPointsCompanion.insert(
        lat: 55.7558,
        lng: 37.6173,
        timestamp: base,
        accuracy: const Value<double?>(5.5),
        speed: const Value<double?>(1.2),
        battery: const Value<int?>(64),
      ),
    );
    await reference.insertGpsPoint(
      GpsPointsCompanion.insert(lat: 55.7560, lng: 37.6180, timestamp: base.add(const Duration(seconds: 15))),
    );
    final List<String> schema = await v1Schema(reference);
    final Map<String, Object?> pendingValues =
        (await reference.customSelect('SELECT * FROM pending_actions').getSingle()).data;
    final List<Map<String, Object?>> gpsValues = (await reference
            .customSelect('SELECT * FROM gps_points ORDER BY id')
            .get())
        .map((QueryRow row) => row.data)
        .toList(growable: false);
    await reference.close();

    // 2. База «v1»: только две таблицы v1, ни одной таблицы кэша, version = 1.
    final Database v1 = sqlite3.openInMemory();
    for (final String sql in schema) {
      v1.execute(sql);
    }
    insertRow(v1, 'pending_actions', pendingValues);
    for (final Map<String, Object?> gps in gpsValues) {
      insertRow(v1, 'gps_points', gps);
    }
    v1.execute('PRAGMA user_version = 1');

    // 3. Приложение открывает базу как обычно: drift видит version 1 и
    //    выполняет `onUpgrade(m, 1, 2)`.
    return AppDatabase(NativeDatabase.opened(v1));
  }


  /// Сколько строк кэша кладёт фикстура v2 (по одной в каждую таблицу кэша).
  const int kCachedRowsInFixture = 7;

  /// База версии 2 с данными оператора и заполненным кэшем чтения.
  ///
  /// Схема снимается с живой базы drift: v2→v3 не меняет SQL существующих
  /// таблиц, добавляется только `chat_messages`, поэтому такой снимок и есть
  /// «схема v2».
  Future<AppDatabase> openV2WithData() async {
    final AppDatabase reference = AppDatabase.memory();

    // Данные оператора — те же, что в v1-фикстуре.
    await reference.insertAction(
      PendingActionsCompanion.insert(
        id: '5f1c0f4e-queue-1',
        kind: PendingActionTypes.chatMessage,
        payloadJson: '{"chatId":"chat-9","text":"Принял, иду","clientMessageId":"client-1"}',
        idempotencyKey: const Value<String>('chat:client-1'),
        status: const Value<String>('pending'),
        createdAt: base,
      ),
    );
    await reference.insertGpsPoint(
      GpsPointsCompanion.insert(lat: 55.7558, lng: 37.6173, timestamp: base),
    );
    await reference.insertGpsPoint(
      GpsPointsCompanion.insert(
        lat: 55.7560,
        lng: 37.6180,
        timestamp: base.add(const Duration(seconds: 15)),
      ),
    );

    // Кэш чтения: по одной строке в каждую таблицу v2.
    await reference.upsertShiftEvents(<ShiftEventsCompanion>[
      ShiftEventsCompanion.insert(
        id: 'event-1',
        scheduleName: 'Утренняя смена',
        status: 'PLANNED',
        updatedAt: base,
        objectId: const Value<String?>('object-1'),
        routeId: const Value<String?>('route-1'),
      ),
    ]);
    await reference.upsertObjects(<CachedObjectsCompanion>[
      CachedObjectsCompanion.insert(
        id: 'object-1',
        name: 'БЦ «Север»',
        updatedAt: base,
        address: const Value<String?>('ул. Ленина, 1'),
      ),
    ]);
    await reference.upsertRoutePoints(<RoutePointsCompanion>[
      RoutePointsCompanion.insert(
        pointId: 'point-1',
        eventId: 'event-1',
        routeId: 'route-1',
        roomId: 'room-1',
      ),
    ]);
    await reference.upsertChecklistOperations(<ChecklistOperationsCompanion>[
      ChecklistOperationsCompanion.insert(
        operationId: 'op-1',
        roomId: 'room-1',
        name: 'Смыть и вытереть',
      ),
    ]);
    await reference.upsertRooms(<CachedRoomsCompanion>[
      CachedRoomsCompanion.insert(id: 'room-1', name: 'Санузел 101'),
    ]);
    await reference.upsertTechCard(
      CachedTechCardsCompanion.insert(
        id: 'card-1',
        name: 'Санузел',
        operationsJson: '[]',
        updatedAt: base,
      ),
    );
    await reference.upsertTickets(<CachedTicketsCompanion>[
      CachedTicketsCompanion.insert(
        id: 'ticket-1',
        type: 'planned',
        priority: 'normal',
        status: 'assigned',
        updatedAt: base,
      ),
    ]);

    const List<String> v2Tables = <String>[
      'pending_actions',
      'gps_points',
      'shift_events',
      'cached_objects',
      'route_points',
      'checklist_operations',
      'cached_rooms',
      'cached_tech_cards',
      'cached_tickets',
    ];

    final List<String> schema = (await reference
            .customSelect(
              "SELECT sql FROM sqlite_master WHERE type = 'table' "
              "AND name IN ('pending_actions', 'gps_points', 'shift_events', 'cached_objects', "
              "'route_points', 'checklist_operations', 'cached_rooms', 'cached_tech_cards', "
              "'cached_tickets') ORDER BY name",
            )
            .get())
        .map((QueryRow row) => row.read<String>('sql'))
        .toList(growable: false);

    final Map<String, List<Map<String, Object?>>> data = <String, List<Map<String, Object?>>>{};
    for (final String table in v2Tables) {
      data[table] = (await reference.customSelect('SELECT * FROM $table').get())
          .map((QueryRow row) => row.data)
          .toList(growable: false);
    }
    await reference.close();

    final Database v2 = sqlite3.openInMemory();
    for (final String sql in schema) {
      v2.execute(sql);
    }
    for (final String table in v2Tables) {
      for (final Map<String, Object?> values in data[table]!) {
        insertRow(v2, table, values);
      }
    }
    // Ни одной таблицы v3 в базе нет — иначе тест не проверял бы миграцию.
    v2.execute('PRAGMA user_version = 2');

    return AppDatabase(NativeDatabase.opened(v2));
  }

  test('pending_actions переживает миграцию: запись, попытки и ключ идемпотентности', () async {
    final AppDatabase db = await openV1WithData();

    final PendingActionRow? row = await db.rowById('5f1c0f4e-queue-1');
    expect(row, isNotNull, reason: 'строка очереди не должна потеряться при обновлении схемы');
    expect(row!.kind, PendingActionTypes.operationCompleted);
    expect(row.payloadJson, '{"ticketId":"ticket-1","operationId":"op1"}');
    expect(row.idempotencyKey, 'op:ticket-1:op1');
    expect(row.status, 'failed');
    expect(row.attempts, 2);
    expect(row.lastError, 'Нет соединения');
    expect(row.nextAttemptAt, base.add(const Duration(seconds: 30)));
    expect(row.createdAt, base);
    expect(row.syncedAt, isNull);

    // Счётчик неотправленного в `AppBar` считает ту же строку.
    expect(await db.outgoingCount(), 1);

    await db.close();
  });

  test('gps_points переживают миграцию: координаты, батарея и порядок точек', () async {
    final AppDatabase db = await openV1WithData();

    final List<GpsPointRow> points = await db.unsyncedGpsPoints();
    expect(points, hasLength(2), reason: 'буфер GPS не должен очищаться при обновлении');
    expect(points.first.lat, 55.7558);
    expect(points.first.lng, 37.6173);
    expect(points.first.accuracy, 5.5);
    expect(points.first.speed, 1.2);
    expect(points.first.battery, 64);
    expect(points.first.timestamp, base);
    expect(points.first.synced, isFalse);
    expect(points[1].timestamp, base.add(const Duration(seconds: 15)));
    expect(await db.unsyncedGpsCount(), 2);

    await db.close();
  });

  test('миграция v1→v3 добавляет восемь таблиц и не пересоздаёт таблицы v1', () async {
    final AppDatabase db = await openV1WithData();

    // Таблицы кэша чтения и лента чата (DS-002 §3) появились и пусты.
    final List<QueryRow> tables = await db
        .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
        .get();
    final Set<String> names = tables
        .map((QueryRow row) => row.read<String>('name'))
        .toSet();
    expect(
      names,
      containsAll(<String>[
        'shift_events',
        'cached_objects',
        'route_points',
        'checklist_operations',
        'cached_rooms',
        'cached_tech_cards',
        'cached_tickets',
        'chat_messages',
      ]),
    );
    expect(await db.cachedRowsCount(), 0, reason: 'новые таблицы создаются пустыми');
    expect(await db.chatMessagesFor('chat-1'), isEmpty);

    // Данные v1 на месте: миграция их не пересоздавала.
    expect(await db.outgoingCount(), 1);
    expect(await db.unsyncedGpsCount(), 2);

    // Версия схемы поднялась до 3 (М6.8 добавила `chat_messages`).
    final QueryRow version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.data.values.single, 3);

    await db.close();
  });

  test('v2→v3: добавляется только chat_messages, данные v2 и кэш целы', () async {
    final AppDatabase db = await openV2WithData();

    // Лента чата — единственная новая таблица, она пуста.
    final Set<String> names = (await db
            .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
            .get())
        .map((QueryRow row) => row.read<String>('name'))
        .toSet();
    expect(names, contains('chat_messages'));
    expect(await db.chatMessagesFor('chat-9'), isEmpty);

    // Данные оператора из v1 не тронуты.
    expect(await db.outgoingCount(), 1);
    expect(await db.unsyncedGpsCount(), 2);

    // Кэш чтения (таблицы v2) на месте — миграция их не пересоздавала.
    expect(await db.cachedRowsCount(), kCachedRowsInFixture);
    expect((await db.shiftEventById('event-1'))?.scheduleName, 'Утренняя смена');
    expect((await db.cachedObjectById('object-1'))?.name, 'БЦ «Север»');
    expect(await db.routePointsForEvent('event-1'), hasLength(1));
    expect(await db.checklistOperationsForRoom('room-1'), hasLength(1));
    expect((await db.cachedRoomById('room-1'))?.name, 'Санузел 101');
    expect((await db.cachedTechCardById('card-1'))?.name, 'Санузел');
    expect(await db.allCachedTickets(), hasLength(1));

    final QueryRow version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.data.values.single, 3);

    await db.close();
  });

  test('после v2→v3 сообщение чата пишется и читается', () async {
    final AppDatabase db = await openV2WithData();

    await db.upsertChatMessage(
      ChatMessagesCompanion.insert(
        clientId: 'client-1',
        chatId: 'chat-9',
        messageText: 'Принял, иду',
        createdAtLocal: base,
        serverId: const Value<String?>(null),
        authorId: const Value<String?>('user-1'),
        status: const Value<String>('pending'),
      ),
    );

    final List<ChatMessageRow> rows = await db.chatMessagesFor('chat-9');
    expect(rows, hasLength(1));
    expect(rows.single.messageText, 'Принял, иду');
    expect(rows.single.status, 'pending');

    await db.markChatMessageSent('client-1', serverId: 'server-1');
    final ChatMessageRow? sent = await db.chatMessageByServerId('server-1');
    expect(sent?.status, 'sent');

    await db.close();
  });

  test('обновлённая база продолжает принимать записи очереди', () async {
    final AppDatabase db = await openV1WithData();
    final DriftPendingActionQueue queue = DriftPendingActionQueue(db, now: () => base);

    await queue.add(
      type: PendingActionTypes.operationCompleted,
      idempotencyKey: 'op:ticket-2:op2',
      payload: <String, dynamic>{'ticketId': 'ticket-2', 'operationId': 'op2'},
      createdAt: base.add(const Duration(minutes: 5)),
    );

    // `pendingCount` — это счётчик неотправленного (`pending` + `sending` +
    // `failed`): старая запись очереди плюс новая.
    expect(await queue.pendingCount(), 2, reason: 'старая `failed` + новая запись');
    expect(await db.outgoingCount(), 2);
    expect(await db.allRows(), hasLength(2));

    // Старая запись осталась нетронутой, новая встала в очередь как `pending`.
    final List<PendingAction> actions = await queue.all();
    expect(actions.first.status, PendingActionStatus.failed);
    expect(actions.first.idempotencyKey, 'op:ticket-1:op1');
    expect(actions.last.status, PendingActionStatus.pending);
    expect(actions.last.attempts, 0);

    await db.close();
  });

  test('новая база создаётся сразу в версии 3 со всеми таблицами', () async {
    final AppDatabase db = AppDatabase.memory();

    final QueryRow version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.data.values.single, 3);

    final Set<String> names = (await db
            .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
            .get())
        .map((QueryRow row) => row.read<String>('name'))
        .toSet();
    expect(
      names,
      containsAll(<String>[
        'pending_actions',
        'gps_points',
        'shift_events',
        'cached_objects',
        'route_points',
        'checklist_operations',
        'cached_rooms',
        'cached_tech_cards',
        'cached_tickets',
        'chat_messages',
      ]),
    );

    await db.close();
  });
}

/// Вставка строки v1 «как её хранит drift»: колонки и значения берутся из
/// снимка живой базы, поэтому тест не зависит от формата хранения DateTime.
void insertRow(Database raw, String table, Map<String, Object?> values) {
  final String columns = values.keys.join(', ');
  final String placeholders = List<String>.filled(values.length, '?').join(', ');
  raw.execute('INSERT INTO $table ($columns) VALUES ($placeholders)', values.values.toList());
}
