import 'dart:io';

import 'package:cleaning_ops_app/core/theme/app_colors.dart';
import 'package:cleaning_ops_app/database/app_cache.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/services/floor_plan_cache.dart';
import 'package:cleaning_ops_app/shared/data/cache/cache_store.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/checklist_fakes.dart';
import '../../helpers/operator_fakes.dart';

/// М6.7 / DS-002 `offline.md` §3: кэш чтения — запись и чтение каждой таблицы.
///
/// Проверяется именно слой кэша (`CacheStore` + drift), а не экраны: доменные
/// модели должны возвращаться из базы теми же, какими пришли из сети, иначе
/// «сначала кэш, потом сеть» (offline.md §1) нарисует оператору другое.
void main() {
  late AppDatabase database;
  late CacheStore cache;

  final DateTime base = DateTime(2026, 9, 16, 10, 0);

  setUp(() {
    database = AppDatabase.memory();
    cache = CacheStore(database);
  });

  tearDown(() => database.close());

  group('семь таблиц кэша', () {
    test('shift_events: смены читаются с полями и статусом check-in', () async {
      final ScheduleEvent event = plannedEvent(
        id: 'ev1',
        objectId: 'object-1',
        routeId: 'route-1',
      );
      await cache.saveEvents(<ScheduleEvent>[event], at: base);

      final List<ScheduleEvent> stored = await cache.events();
      expect(stored, hasLength(1));
      expect(stored.single.id, 'ev1');
      expect(stored.single.scheduleName, event.scheduleName);
      expect(stored.single.objectId, 'object-1');
      expect(stored.single.routeId, 'route-1');
      expect(stored.single.status, 'PLANNED');
      expect(await cache.eventsUpdatedAt(), base, reason: '«Данные от {HH:mm}»');

      // Статус, который сервер вернул после отметки, виден в кэше сразу
      // (время записи при этом обновляется — «Данные от {HH:mm}»).
      await cache.saveEventStatus('ev1', status: 'CHECKED_IN');
      expect((await cache.event('ev1'))!.status, 'CHECKED_IN');
      expect(await cache.eventsUpdatedAt(), isNotNull);
    });

    test('cached_objects: объект с адресом и координатами', () async {
      await cache.saveObject(
        const ObjectSummary(
          id: 'object-1',
          name: 'БЦ Романов',
          address: 'ул. Ленина, 1',
          lat: 55.75,
          lng: 37.61,
          status: 'ACTIVE',
        ),
        at: base,
      );

      final ObjectSummary? stored = await cache.object('object-1');
      expect(stored, isNotNull);
      expect(stored!.name, 'БЦ Романов');
      expect(stored.address, 'ул. Ленина, 1');
      expect(stored.lat, 55.75);
      expect(stored.lng, 37.61);
      expect(stored.status, 'ACTIVE');
      expect(await cache.object('unknown'), isNull);
    });

    test('route_points и cached_rooms: точки маршрута, координаты и локальный прогресс', () async {
      await cache.saveRoute(eventId: 'ev1', route: routeWithTwoRooms(), at: base);

      final RouteDetail? route = await cache.route('ev1');
      expect(route, isNotNull);
      expect(route!.points, hasLength(2));
      expect(route.points.first.id, 'p1');
      expect(route.points.first.roomId, 'room-1');
      expect(route.points.first.roomName, 'Санузел', reason: 'название из cached_rooms');
      expect(route.totalEstimatedTimeMin, 0);

      // Прогресс точки переживает оффлайн: статус пишется в route_points.
      await cache.saveRoutePointStatus(
        pointId: 'p1',
        status: RoutePointStatus.done,
        completedAtLocal: base,
      );
      final Map<String, RoutePointStatus> statuses = await cache.routePointStatuses('ev1');
      expect(statuses['p1'], RoutePointStatus.done);
      expect(statuses['p2'], RoutePointStatus.pending);

      final List<RoutePointRow> rows = await database.routePointsForEvent('ev1');
      expect(rows.first.completedAtLocal, base);
      expect(rows.first.orderIndex, 0);
    });

    test('checklist_operations: операции техкарты, таймер, фото и статус', () async {
      await cache.saveOperations(
        roomId: 'room-1',
        ticketId: 'ticket-1',
        operations: <CachedOperation>[
          CachedOperation(
            operation: techOperation(id: 'op1', name: 'Надеть СИЗ', estimatedTimeMin: 2),
            status: 'completed',
            startedAtLocal: base,
            completedAtLocal: base.add(const Duration(minutes: 3)),
            photoLocalPath: '/tmp/op1.jpg',
          ),
          CachedOperation(
            operation: techOperation(
              id: 'op2',
              name: 'Намылить',
              orderIndex: 1,
              requiresPhoto: true,
              equipment: <String, dynamic>{
                'items': <String>['швабра'],
              },
            ),
            status: 'queued',
          ),
        ],
      );

      final List<CachedOperation> stored = await cache.operations('room-1');
      expect(stored, hasLength(2));
      expect(stored.first.operation.name, 'Надеть СИЗ');
      expect(stored.first.status, 'completed', reason: 'статус операции — код OperationStatus');
      expect(stored.first.startedAtLocal, base);
      expect(stored.first.completedAtLocal, base.add(const Duration(minutes: 3)));
      expect(stored.first.photoLocalPath, '/tmp/op1.jpg');
      expect(stored[1].operation.orderIndex, 1);
      expect(stored[1].operation.requiresPhoto, isTrue);
      expect(stored[1].operation.equipment['items'], <String>['швабра']);
      expect(stored[1].status, 'queued');
      expect(await cache.operations('room-2'), isEmpty);
    });

    test('cached_rooms: ответ /api/rooms/:id не стирает координаты из маршрута', () async {
      await cache.saveRoute(eventId: 'ev1', route: routeWithTwoRooms(), at: base);
      // Координаты маркера приходят только в точках маршрута.
      await cache.saveRooms(<CachedRoomInput>[
        const CachedRoomInput(
          id: 'room-1',
          name: 'Санузел 101',
          floorId: 'f1',
          coordsX: 100,
          coordsY: 200,
          coordsWidth: 60,
          coordsHeight: 40,
        ),
      ]);
      // `GET /api/rooms/:id` даёт техкарту и не знает про координаты.
      await cache.saveRoom(
        const RoomDetail(id: 'room-1', name: 'Санузел 101', floorId: 'f1', techCardId: 'tc1'),
      );

      final RoomDetail? room = await cache.room('room-1');
      expect(room!.techCardId, 'tc1');
      final CachedRoomRow? row = await database.cachedRoomById('room-1');
      expect(row!.coordsX, 100, reason: 'координаты маркера уцелели');
      expect(row.coordsY, 200);
      expect(row.coordsWidth, 60);
      expect(row.coordsHeight, 40);
    });

    test('cached_tech_cards: операции техкарты восстанавливаются из JSON', () async {
      await cache.saveTechCard(
        techCardOf(<TechOperation>[
          techOperation(id: 'op1', name: 'Надеть СИЗ', estimatedTimeMin: 2),
          techOperation(id: 'op2', name: 'Намылить', orderIndex: 1, estimatedTimeMin: 5),
        ]),
        at: base,
      );

      final TechCardDetail? card = await cache.techCard('tc1');
      expect(card, isNotNull);
      expect(card!.name, 'Влажная уборка санузла');
      expect(card.totalEstimatedTimeMin, 7);
      expect(card.operations.map((TechOperation op) => op.id), <String>['op1', 'op2']);
      expect(card.operations[1].name, 'Намылить');
      expect(await cache.techCard('unknown'), isNull);
    });

    test('cached_tickets: заявки с прогрессом операций', () async {
      await cache.saveTickets(
        <TicketSummary>[
          const TicketSummary(
            id: 'ticket-1',
            status: 'in_progress',
            type: 'cleaning',
            priority: 'high',
            description: 'Помыть полы',
            roomId: 'room-1',
            completionDeadline: '2026-09-16T12:00:00.000Z',
            operationsCompleted: 3,
          ),
        ],
        at: base,
      );

      final List<TicketSummary> stored = await cache.tickets();
      expect(stored, hasLength(1));
      expect(stored.single.id, 'ticket-1');
      expect(stored.single.priority, 'high');
      expect(stored.single.description, 'Помыть полы');
      expect(stored.single.operationsCompleted, 3);
      expect(stored.single.completionDeadline, '2026-09-16T12:00:00.000Z');
    });
  });

  group('обслуживание кэша', () {
    test('пустой кэш: isEmpty и без времени записи', () async {
      expect(await cache.isEmpty(), isTrue);
      expect(await cache.lastUpdatedAt(), isNull);
    });

    test('очистка кэша не трогает очередь действий и GPS-буфер', () async {
      await cache.saveEvents(<ScheduleEvent>[plannedEvent(id: 'ev1')], at: base);
      await cache.saveTickets(
        <TicketSummary>[
          const TicketSummary(
            id: 'ticket-1',
            status: 'new',
            type: 'cleaning',
            priority: 'low',
            description: '',
          ),
        ],
      );
      expect(await cache.isEmpty(), isFalse);

      // Данные оператора: очередь и GPS-буфер (profile.md п. 11.7).
      await database.insertAction(
        PendingActionsCompanion.insert(
          id: 'queue-1',
          kind: PendingActionTypes.operationCompleted,
          payloadJson: '{}',
          createdAt: base,
        ),
      );
      await database.insertGpsPoint(
        GpsPointsCompanion.insert(lat: 55.75, lng: 37.61, timestamp: base),
      );

      await database.clearCachedTables();

      expect(await cache.isEmpty(), isTrue);
      expect(await database.cachedRowsCount(), 0);
      expect(await database.outgoingCount(), 1, reason: 'очередь действий не чистится');
      expect(await database.unsyncedGpsCount(), 1, reason: 'буфер GPS не чистится');
    });
  });

  group('plans_dir: файловый кэш плана этажа', () {
    late Directory plansRoot;
    late FakeHttpAdapter http;
    late FloorPlanCache plans;

    const FloorPlan floor = FloorPlan(
      id: 'f1',
      number: 3,
      planImageUrl: 'http://plans.test/floor3.png',
      planWidth: 800,
      planHeight: 600,
    );

    setUp(() {
      plansRoot = Directory.systemTemp.createTempSync('plans_dir_test');
      http = FakeHttpAdapter((RequestOptions options) async => const FakeResponse(200, <String, Object?>{'plan': true}));
      plans = FloorPlanCache(
        api: fakeApiClient(http, baseUrl: 'http://plans.test'),
        documentsDirectory: () async => plansRoot,
      );
    });

    tearDown(() => plansRoot.deleteSync(recursive: true));

    test('файл и метаданные лежат в plans_dir/{floorId}.img + .meta.json', () async {
      final CachedFloorPlan saved = await plans.save(floor, <int>[1, 2, 3, 4]);

      expect(saved.file.path, endsWith('plans_dir/f1.img'));
      expect(await saved.file.length(), 4);
      expect(File('${plansRoot.path}/plans_dir/f1.meta.json').existsSync(), isTrue);
      expect(await plans.sizeBytes(), greaterThan(0));

      final CachedFloorPlan? cached = await plans.read('f1');
      expect(cached, isNotNull);
      expect(cached!.meta.floorId, 'f1');
      expect(cached.meta.number, 3);
      expect(cached.floor.planWidth, 800);
      expect(cached.floor.planHeight, 600);
      expect((await plans.cachedImage('f1'))!.path, endsWith('f1.img'));
      expect(await plans.read('f2'), isNull, reason: 'чужого этажа в кэше нет');
    });

    test('ensure отдаёт план из кэша и не ходит в сеть повторно', () async {
      // Первый вызов: кэша нет — план скачивается (`GET /api/floors`-картинка).
      final CachedFloorPlan? first = await plans.ensure(floor);
      expect(first, isNotNull);
      expect(http.requests, hasLength(1), reason: 'скачивание плана один раз');

      // Второй вызов: файл уже есть — сеть не нужна (DS-002 §1).
      final CachedFloorPlan? second = await plans.ensure(floor);
      expect(second!.file.path, first!.file.path);
      expect(http.requests, hasLength(1), reason: 'из кэша, без сети');
    });

    test('нет сети и нет кэша: ensure возвращает null, а не падает', () async {
      final FloorPlanCache offline = FloorPlanCache(
        api: fakeApiClient(http, baseUrl: 'http://plans.test'),
        documentsDirectory: () async => plansRoot,
      );
      expect(await offline.ensure(floor, online: false), isNull);
      expect(http.requests, isEmpty);
    });

    test('clear удаляет каталог планов', () async {
      await plans.save(floor, <int>[1, 2, 3, 4]);
      await plans.clear();
      expect(await plans.read('f1'), isNull);
      expect(plansRoot.existsSync(), isTrue, reason: 'удаляется только plans_dir');
    });
  });
}
