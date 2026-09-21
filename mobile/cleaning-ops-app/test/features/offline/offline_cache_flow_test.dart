import 'dart:async';
import 'dart:io';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/core/utils/clock.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/database/drift_pending_action_queue.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/checklist_texts.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/pages/checklist_page.dart';
import 'package:cleaning_ops_app/features/home/presentation/pages/home_today_page.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/floor_plan_cache.dart';
import 'package:cleaning_ops_app/services/queue_action_sender.dart';
import 'package:cleaning_ops_app/services/sync_status.dart';
import 'package:cleaning_ops_app/shared/data/cache/cache_store.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/operation_completion.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:cleaning_ops_app/shared/services/photo_service.dart';
import 'package:cleaning_ops_app/shared/widgets/offline_banner.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/checklist_fakes.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/operator_fakes.dart';
import '../../helpers/screen_harness.dart';

/// М6.7 / DS-002 `offline.md`: поведение экранов с кэшем чтения.
///
/// Проверяется то, что нельзя проверить на уровне `CacheStore`:
/// 1. правило §1 — «экран сначала рисует кэш, потом сеть» (и ошибка сети не
///    стирает уже показанные данные);
/// 2. индикаторы из §2 — оффлайн-баннер, «Данные от {HH:mm}» и счётчик
///    неотправленного по своим `Key`;
/// 3. сценарии §10.1–§10.3 на **настоящей** drift-очереди: запись при
///    оффлайне, смена статуса после синхронизации и `alreadyCompleted`.
/// Сеть, которая «молчит»: ответ приходит только после [GatedScheduleRepository.release].
///
/// Нужна, чтобы поймать кадр, на котором экран уже нарисовал кэш, а сеть ещё
/// не ответила (DS-002 `offline.md` §1).
class GatedScheduleRepository extends FakeScheduleRepository {
  GatedScheduleRepository({required super.events});

  final Completer<void> gate = Completer<void>();

  void release() => gate.complete();

  @override
  Future<Result<List<ScheduleEvent>>> myEvents({String? date}) async {
    await gate.future;
    return super.myEvents(date: date);
  }
}

/// Сервер уже отметил операцию: ответ `alreadyCompleted: true` (DS-002 §5.2.6).
class AlreadyCompletedTicketsRepository extends FakeTicketsRepository {
  @override
  Future<Result<CompleteOperationResult>> completeOperation({
    required String ticketId,
    required String operationId,
    DateTime? completedAt,
    String? photoUrl,
    bool requiresPhoto = false,
    int? totalOperations,
  }) async {
    completeCalls.add(<String, Object?>{'ticketId': ticketId, 'operationId': operationId});
    return Ok<CompleteOperationResult>(
      CompleteOperationResult(
        operationId: operationId,
        ticketId: ticketId,
        alreadyCompleted: true,
      ),
    );
  }
}

void main() {
  const String eventId = 'ev1';
  final DateTime base = DateTime(2026, 9, 16, 10, 42);

  // Даты в интерфейсе — на русском, как в приложении (`main.dart`).
  setUpAll(() async => initializeDateFormatting('ru'));

  late AppDatabase database;
  late CacheStore cache;
  late Directory plansRoot;

  setUp(() {
    database = AppDatabase.memory();
    cache = CacheStore(database);
    plansRoot = Directory.systemTemp.createTempSync('offline_flow_plans');
    // `plans_dir` создаём синхронно, до теста: `Directory.create` — настоящее
    // асинхронное I/O, а внутри fake-async зоны теста его продолжение не
    // выполняется (подробности — в отчёте).
    Directory('${plansRoot.path}/${FloorPlanCache.directoryName}').createSync(recursive: true);
  });

  tearDown(() {
    plansRoot.deleteSync(recursive: true);
  });

  /// Смена, которая лежит в кэше: имя отличается от сетевого, чтобы было видно,
  /// чьи данные нарисованы на экране.
  const ScheduleEvent cachedEvent = ScheduleEvent(
    id: eventId,
    scheduleName: 'Смена из кэша',
    date: '2026-09-16',
    plannedStart: '2026-09-16T08:00:00.000Z',
    status: 'PLANNED',
    objectId: 'object-1',
  );

  Widget today({
    required FakeScheduleRepository schedule,
    bool online = true,
  }) {
    return ProviderScope(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        scheduleRepositoryProvider.overrideWithValue(schedule),
        coreRepositoryProvider.overrideWithValue(
          FakeCoreRepository(
            objectSummary: const ObjectSummary(
              id: 'object-1',
              name: 'БЦ Романов',
              address: 'ул. Ленина, 1',
            ),
          ),
        ),
        ticketsRepositoryProvider.overrideWithValue(FakeTicketsRepository()),
        locationServiceProvider.overrideWithValue(FakeLocationService()),
      ],
      child: const MaterialApp(home: HomeTodayPage()),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  ProviderContainer containerOf(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byKey(const Key('today_page'))));

  /// Число на счётчике неотправленного в `AppBar` (DS-002 §2).
  String? counterText(WidgetTester tester) => tester
      .widget<Text>(
        find.descendant(
          of: find.byKey(const Key('today_sync_status')),
          matching: find.byType(Text),
        ),
      )
      .data;

  group('§1: сначала кэш, потом сеть', () {
    screenTest(
      'кэш нарисован сразу, ответ сети заменяет его',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[cachedEvent], at: base);
        final GatedScheduleRepository schedule = GatedScheduleRepository(
          events: <ScheduleEvent>[plannedEvent(id: eventId, objectId: 'object-1')],
        );

        await tester.pumpWidget(today(schedule: schedule));
        await settle(tester);

        // Сеть ещё не ответила — на экране данные кэша.
        expect(find.text('Смена из кэша'), findsOneWidget);
        expect(find.text('Утренняя смена'), findsNothing);

        // Сеть ответила — экран обновился.
        schedule.release();
        await settle(tester);
        await settle(tester);

        expect(find.text('Утренняя смена'), findsOneWidget);
        expect(find.text('Смена из кэша'), findsNothing);
      },
      database: () => database,
    );

    screenTest(
      'ошибка сети не стирает показанный кэш',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[cachedEvent], at: base);

        await tester.pumpWidget(
          today(schedule: FakeScheduleRepository(eventsFailure: const NetworkFailure())),
        );
        await settle(tester);

        expect(find.text('Смена из кэша'), findsOneWidget, reason: 'кэш остаётся на экране');
        expect(find.text('Не удалось загрузить смены'), findsNothing);
        expect(find.byKey(const Key('today_error_retry')), findsNothing);
      },
      database: () => database,
    );
  });

  group('§2, §7: индикаторы оффлайна', () {
    screenTest(
      'оффлайн: баннер с текстом и временем кэша, смены на месте',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[cachedEvent], at: base);

        await tester.pumpWidget(
          today(
            // Сеть не отвечает: экран остаётся на данных кэша, поэтому видно и
            // «Данные от {HH:mm}» — иначе фоновая загрузка заменила бы состояние
            // на сетевое (DS-002 §7: баннер с временем кэша).
            schedule: FakeScheduleRepository(eventsFailure: const NetworkFailure()),
            online: false,
          ),
        );
        await settle(tester);

        expect(find.byKey(const Key('today_offline_banner')), findsOneWidget);
        expect(find.text(OfflineIndicatorTexts.offline), findsOneWidget);
        expect(find.text('Данные от 10:42'), findsOneWidget);
        expect(find.text('Смена из кэша'), findsOneWidget, reason: 'смена видна без сети');
        expect(find.byKey(const Key('today_shift_card')), findsOneWidget);
      },
      database: () => database,
    );

    screenTest(
      'онлайн: баннера и счётчика нет, пока очередь пуста',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[cachedEvent], at: base);

        await tester.pumpWidget(
          today(schedule: FakeScheduleRepository(events: <ScheduleEvent>[cachedEvent])),
        );
        await settle(tester);

        expect(find.byKey(const Key('today_offline_banner')), findsNothing);
        expect(find.byKey(const Key('today_sync_status')), findsNothing);
        expect(find.byIcon(Icons.sync_problem), findsNothing);
      },
      database: () => database,
    );

    screenTest(
      'счётчик неотправленного показывает число записей очереди',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[cachedEvent], at: base);
        final DriftPendingActionQueue queue = DriftPendingActionQueue(database, now: () => base);
        await queue.add(
          type: PendingActionTypes.operationCompleted,
          idempotencyKey: 'op:ticket-1:op1',
          payload: <String, dynamic>{'ticketId': 'ticket-1', 'operationId': 'op1'},
          createdAt: base,
        );
        await queue.add(
          type: PendingActionTypes.operationCompleted,
          idempotencyKey: 'op:ticket-1:op2',
          payload: <String, dynamic>{'ticketId': 'ticket-1', 'operationId': 'op2'},
          createdAt: base.add(const Duration(seconds: 1)),
        );

        await tester.pumpWidget(
          today(schedule: FakeScheduleRepository(events: <ScheduleEvent>[cachedEvent])),
        );
        await settle(tester);

        expect(find.byKey(const Key('today_sync_status')), findsOneWidget);
        expect(find.byIcon(Icons.sync_problem), findsOneWidget);
        expect(counterText(tester), '2');
      },
      database: () => database,
    );
  });

  group('§10.2: синхронизация очереди', () {
    screenTest(
      'успешная отправка переводит запись в synced и уменьшает счётчик 2 → 1',
      (tester) async {
        final DriftPendingActionQueue queue = DriftPendingActionQueue(database, now: () => base);
        await queue.add(
          type: PendingActionTypes.operationCompleted,
          idempotencyKey: 'op:ticket-1:op1',
          payload: <String, dynamic>{'ticketId': 'ticket-1', 'operationId': 'op1'},
          createdAt: base,
        );
        await queue.add(
          type: PendingActionTypes.operationCompleted,
          idempotencyKey: 'op:ticket-1:op2',
          payload: <String, dynamic>{'ticketId': 'ticket-1', 'operationId': 'op2'},
          createdAt: base.add(const Duration(seconds: 1)),
        );

        final ScriptedSender sender = ScriptedSender(
          results: <QueueSendResult>[
            const QueueSendResult.success(),
            // §5.2.7: 4xx не ретраится — запись остаётся в счётчике как `failed`.
            const QueueSendResult.permanent('Вы не участник этого чата'),
          ],
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: <Override>[
              appDatabaseProvider.overrideWithValue(database),
              connectivityServiceProvider.overrideWithValue(FakeConnectivityService()),
              queueActionSenderProvider.overrideWithValue(sender),
              scheduleRepositoryProvider.overrideWithValue(
                FakeScheduleRepository(events: <ScheduleEvent>[cachedEvent]),
              ),
              coreRepositoryProvider.overrideWithValue(FakeCoreRepository()),
              ticketsRepositoryProvider.overrideWithValue(FakeTicketsRepository()),
              locationServiceProvider.overrideWithValue(FakeLocationService()),
            ],
            child: const MaterialApp(home: HomeTodayPage()),
          ),
        );
        await settle(tester);
        expect(counterText(tester), '2', reason: 'до синхронизации в очереди две записи');

        await containerOf(tester).read(syncStatusProvider.notifier).runOnce();
        await settle(tester);
        await settle(tester);

        final List<PendingActionRow> rows = await database.allRows();
        expect(rows, hasLength(2));
        expect(rows.first.idempotencyKey, 'op:ticket-1:op1');
        expect(rows.first.status, 'synced', reason: '§10.2: успешная отправка — `synced`');
        expect(rows.first.syncedAt, isNotNull, reason: 'время отправки записано');
        expect(rows.last.status, 'failed', reason: '§5.2.7: 4xx не ретраится');
        expect(rows.last.lastError, 'Вы не участник этого чата');

        expect(counterText(tester), '1', reason: 'счётчик уменьшился: осталась `failed`');
      },
      database: () => database,
    );

    screenTest(
      '§10.3: alreadyCompleted — успех, запись synced и счётчик обнуляется',
      (tester) async {
        final DriftPendingActionQueue queue = DriftPendingActionQueue(database, now: () => base);
        await queue.add(
          type: PendingActionTypes.operationCompleted,
          idempotencyKey: 'op:ticket-1:op1',
          payload: <String, dynamic>{'ticketId': 'ticket-1', 'operationId': 'op1'},
          createdAt: base,
        );
        final AlreadyCompletedTicketsRepository tickets = AlreadyCompletedTicketsRepository();

        await tester.pumpWidget(
          ProviderScope(
            overrides: <Override>[
              appDatabaseProvider.overrideWithValue(database),
              connectivityServiceProvider.overrideWithValue(FakeConnectivityService()),
              scheduleRepositoryProvider.overrideWithValue(
                FakeScheduleRepository(events: <ScheduleEvent>[cachedEvent]),
              ),
              coreRepositoryProvider.overrideWithValue(FakeCoreRepository()),
              ticketsRepositoryProvider.overrideWithValue(tickets),
              locationServiceProvider.overrideWithValue(FakeLocationService()),
            ],
            child: const MaterialApp(home: HomeTodayPage()),
          ),
        );
        await settle(tester);
        expect(counterText(tester), '1');

        await containerOf(tester).read(syncStatusProvider.notifier).runOnce();
        await settle(tester);
        await settle(tester);

        final PendingActionRow row = (await database.allRows()).single;
        expect(row.status, 'synced', reason: '§5.2.6: alreadyCompleted — это успех');
        expect(row.syncedAt, isNotNull);
        expect(row.attempts, 0, reason: 'повторных попыток нет');
        expect(tickets.completeCalls, hasLength(1));

        // Очередь пуста — счётчик исчезает вместе с ключом (DS-002 §2).
        expect(find.byKey(const Key('today_sync_status')), findsNothing);
      },
      database: () => database,
    );
  });

  group('§10.1 и §1 на чек-листе', () {
    List<Override> checklistOverrides({
      required FakeScheduleRepository schedule,
      required FakeTicketsRepository tickets,
    }) {
      final FloorPlanCache plans = FloorPlanCache(
        api: fakeApiClient(FakeHttpAdapter((RequestOptions options) async => const FakeResponse(200, <String, Object?>{}))),
        documentsDirectory: () async => plansRoot,
      );
      return <Override>[
        appDatabaseProvider.overrideWithValue(database),
        floorPlanCacheProvider.overrideWithValue(plans),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: false)),
        scheduleRepositoryProvider.overrideWithValue(schedule),
        coreRepositoryProvider.overrideWithValue(
          FakeCoreRepository(
            roomDetail: roomWithTechCard(),
            floorPlan: const FloorPlan(id: 'f1', number: 3),
            techCardDetail: techCardOf(<TechOperation>[
              techOperation(id: 'op1', name: 'Надеть СИЗ', estimatedTimeMin: 2),
              techOperation(id: 'op2', name: 'Намылить', orderIndex: 1, estimatedTimeMin: 5),
            ]),
            routeDetail: routeWithTwoRooms(),
          ),
        ),
        ticketsRepositoryProvider.overrideWithValue(tickets),
        filesRepositoryProvider.overrideWithValue(FakeFilesRepository()),
        photoCaptureServiceProvider.overrideWithValue(FakePhotoCaptureService()),
        locationServiceProvider.overrideWithValue(FakeLocationService()),
        nowProvider.overrideWithValue(() => base),
      ];
    }

    Widget checklist(List<Override> overrides) {
      return ProviderScope(
        overrides: overrides,
        child: const MaterialApp(home: ChecklistPage(eventId: eventId, roomId: 'room-1')),
      );
    }

    screenTest(
      'без сети завершение уходит в pending_actions на drift и помечается «Отправляется…»',
      (tester) async {
        await tester.pumpWidget(
          checklist(
            checklistOverrides(
              schedule: FakeScheduleRepository(events: <ScheduleEvent>[checkedInEvent(id: eventId)]),
              tickets: FakeTicketsRepository(completeFailure: const NetworkFailure()),
            ),
          ),
        );
        await settle(tester);

        await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
        await tester.pumpAndSettle();

        // §10.1: одна запись `operation_complete` со статусом `pending`,
        // нулём попыток и ключом идемпотентности `op:<ticketId>:<operationId>`.
        final List<PendingActionRow> rows = await database.allRows();
        expect(rows, hasLength(1));
        expect(rows.single.kind, PendingActionTypes.operationCompleted);
        expect(rows.single.status, 'pending');
        expect(rows.single.attempts, 0);
        expect(rows.single.idempotencyKey, 'op:ticket-1:op1');
        expect(rows.single.syncedAt, isNull);
        expect(rows.single.payloadJson, contains('"operationId":"op1"'));

        // Экран показывает «Отправляется…», а не ошибку.
        expect(find.byKey(const Key('checklist_op_queued_op1')), findsOneWidget);
        expect(find.text(ChecklistTexts.sending), findsOneWidget);
        expect(find.byKey(const Key('checklist_action_error')), findsNothing);
      },
      database: () => database,
    );

    screenTest(
      'чек-лист рисует операции из кэша, пока сеть молчит',
      (tester) async {
        // Кэш: смена, помещение, техкарта, операции и файл плана этажа.
        await cache.saveEvents(<ScheduleEvent>[checkedInEvent(id: eventId)], at: base);
        await cache.saveRoom(roomWithTechCard());
        await cache.saveTechCard(
          techCardOf(<TechOperation>[
            techOperation(id: 'op1', name: 'Надеть СИЗ', estimatedTimeMin: 2),
            techOperation(id: 'op2', name: 'Намылить', orderIndex: 1, estimatedTimeMin: 5),
          ]),
          at: base,
        );
        await cache.saveOperations(
          roomId: 'room-1',
          ticketId: 'ticket-1',
          operations: <CachedOperation>[
            CachedOperation(
              operation: techOperation(id: 'op1', name: 'Надеть СИЗ', estimatedTimeMin: 2),
              status: 'completed',
              startedAtLocal: base,
              completedAtLocal: base.add(const Duration(minutes: 3)),
            ),
            CachedOperation(
              operation: techOperation(id: 'op2', name: 'Намылить', orderIndex: 1),
              status: 'active',
              startedAtLocal: base.add(const Duration(minutes: 3)),
            ),
          ],
        );
        await tester.pumpWidget(
          checklist(
            checklistOverrides(
              // Сеть «молчит»: всё, что видно на экране, пришло из кэша.
              schedule: GatedScheduleRepository(events: <ScheduleEvent>[]),
              tickets: FakeTicketsRepository(),
            ),
          ),
        );
        await settle(tester);

        // Этаж берётся из plans_dir (`floorPlanCacheProvider.read`): файла в
        // тесте нет, поэтому заголовок без номера этажа — сам файловый кэш
        // проверяется напрямую в `test/shared/data/cache_store_test.dart`.
        expect(find.text('Санузел 101'), findsOneWidget);
        expect(find.byKey(const Key('checklist_op_tile_op1')), findsOneWidget);
        expect(find.byKey(const Key('checklist_op_tile_op2')), findsOneWidget);
        expect(find.byKey(const Key('checklist_op_queued_op1')), findsNothing);
        expect(
          tester.widget<Text>(find.byKey(const Key('checklist_op_state_op1'))).data,
          ChecklistTexts.completed,
          reason: 'статус операции восстановлен из кэша',
        );
        expect(find.byKey(const Key('checklist_offline_banner')), findsOneWidget);
      },
      database: () => database,
    );

    screenTest(
      'сбой файлового кэша плана не роняет чек-лист из кэша',
      (tester) async {
        await cache.saveEvents(<ScheduleEvent>[checkedInEvent(id: eventId)], at: base);
        await cache.saveRoom(roomWithTechCard());
        await cache.saveTechCard(
          techCardOf(<TechOperation>[techOperation(id: 'op1', name: 'Надеть СИЗ')]),
          at: base,
        );
        await cache.saveOperations(
          roomId: 'room-1',
          ticketId: 'ticket-1',
          operations: <CachedOperation>[
            CachedOperation(operation: techOperation(id: 'op1', name: 'Надеть СИЗ')),
          ],
        );

        // `path_provider` недоступен (на устройстве это сбой каталога): план
        // этажа прочитать нельзя, но операции из drift обязаны показаться —
        // иначе оператор без сети остаётся без чек-листа (DS-002 §1, §7).
        final FloorPlanCache broken = FloorPlanCache(
          api: fakeApiClient(
            FakeHttpAdapter((RequestOptions options) async => const FakeResponse(200, <String, Object?>{})),
          ),
          documentsDirectory: () async => throw StateError('каталог недоступен'),
        );

        final List<Override> overrides = checklistOverrides(
          schedule: GatedScheduleRepository(events: <ScheduleEvent>[]),
          tickets: FakeTicketsRepository(),
        );
        overrides[1] = floorPlanCacheProvider.overrideWithValue(broken);
        await tester.pumpWidget(checklist(overrides));
        await settle(tester);

        expect(find.text('Санузел 101'), findsOneWidget);
        expect(find.byKey(const Key('checklist_op_tile_op1')), findsOneWidget);
        expect(find.byKey(const Key('checklist_error_retry')), findsNothing);
      },
      database: () => database,
    );
  });
}
