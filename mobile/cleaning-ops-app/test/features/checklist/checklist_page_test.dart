import 'dart:io';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/core/utils/clock.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/checklist_texts.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/pages/checklist_page.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/providers/checklist_providers.dart';
import 'package:cleaning_ops_app/features/route_map/presentation/providers/route_providers.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:cleaning_ops_app/shared/services/photo_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/screen_harness.dart';
import '../../helpers/checklist_fakes.dart';
import '../../helpers/operator_fakes.dart';

/// М6.4: сценарии из `design/screens/mobile/checklist.md` §10 — блокировка шагов,
/// обязательное фото, «Завершить помещение», оффлайн-завершение.
void main() {
  const String eventId = 'ev1';
  const ChecklistArgs args = ChecklistArgs(eventId: eventId, roomId: 'room-1');

  DateTime now = DateTime(2026, 9, 16, 10, 0);

  setUp(() => now = DateTime(2026, 9, 16, 10, 0));

  // Экран читает кэш первым (М6.7): база — drift в памяти, отдельная на тест.
  late AppDatabase database;

  /// Widget-тест экрана поверх drift-базы файла: `screenTest` снимает дерево и
  /// закрывает базу внутри тела теста (иначе `flutter test` зависает — см.
  /// `test/helpers/screen_harness.dart`).
  void appTest(String description, Future<void> Function(WidgetTester tester) body) {
    screenTest(description, body, database: () => database);
  }

  setUp(() => database = AppDatabase.memory());

  List<Override> overrides({
    required List<TechOperation> operations,
    ScheduleEvent? event,
    RoomDetail? room,
    RouteDetail? route,
    FakeCoreRepository? core,
    FakeTicketsRepository? tickets,
    FakeFilesRepository? files,
    FakePhotoCaptureService? photos,
    PendingActionQueue? queue,
  }) {
    return <Override>[
      appDatabaseProvider.overrideWithValue(database),
      scheduleRepositoryProvider.overrideWithValue(
        FakeScheduleRepository(events: <ScheduleEvent>[event ?? checkedInEvent(id: eventId)]),
      ),
      coreRepositoryProvider.overrideWithValue(
        core ??
            FakeCoreRepository(
              roomDetail: room ?? roomWithTechCard(),
              floorPlan: const FloorPlan(id: 'f1', number: 3),
              techCardDetail: techCardOf(operations),
              routeDetail: route ?? routeWithTwoRooms(),
            ),
      ),
      ticketsRepositoryProvider.overrideWithValue(tickets ?? FakeTicketsRepository()),
      filesRepositoryProvider.overrideWithValue(files ?? FakeFilesRepository()),
      photoCaptureServiceProvider.overrideWithValue(photos ?? FakePhotoCaptureService()),
      pendingActionQueueProvider.overrideWithValue(queue ?? InMemoryPendingActionQueue()),
      locationServiceProvider.overrideWithValue(FakeLocationService()),
      nowProvider.overrideWithValue(() => now),
    ];
  }

  Widget wrap(List<Override> list) {
    return ProviderScope(
      overrides: list,
      child: const MaterialApp(home: ChecklistPage(eventId: eventId, roomId: 'room-1')),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// Две операции: «Надеть СИЗ» и «Нанести чистящее средство».
  List<TechOperation> twoOperations({bool secondRequiresPhoto = false}) => <TechOperation>[
        techOperation(id: 'op1', name: 'Надеть СИЗ', orderIndex: 0, estimatedTimeMin: 2),
        techOperation(
          id: 'op2',
          name: 'Нанести чистящее средство',
          orderIndex: 1,
          estimatedTimeMin: 5,
          requiresPhoto: secondRequiresPhoto,
        ),
      ];

  appTest('шаг 2 заблокирован, пока не завершён шаг 1', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    await tester.pumpWidget(wrap(overrides(operations: twoOperations(), tickets: tickets)));
    await settle(tester);

    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_op_complete_button_op2'))).onPressed,
      isNull,
    );
    expect(find.text(ChecklistTexts.lockedAfter('Надеть СИЗ')), findsOneWidget);
    expect(find.byKey(const Key('checklist_op_locked_op2')), findsOneWidget);

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
    await settle(tester);

    expect(tickets.completeCalls.single['operationId'], 'op1');
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_op_complete_button_op2'))).onPressed,
      isNotNull,
      reason: 'после завершения первой операции вторая разблокирована',
    );
    expect(find.byKey(const Key('checklist_op_locked_op2')), findsNothing);
    expect(find.text(ChecklistTexts.completed), findsOneWidget);
  });

  appTest('цвет инвентаря: санузел — красный в шапке, зона «Зелёная» важнее типа', (tester) async {
    await tester.pumpWidget(wrap(overrides(operations: twoOperations())));
    await settle(tester);

    expect(find.byKey(const Key('checklist_color_zone')), findsOneWidget);
    expect(find.text(ChecklistTexts.colorZone('Красный', 'Санитарные зоны')), findsOneWidget);
  });

  appTest('цвет инвентаря: явная зона помещения важнее его типа', (tester) async {
    await tester.pumpWidget(
      wrap(overrides(operations: twoOperations(), room: roomWithTechCard(zone: 'Зелёная зона'))),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.colorZone('Зелёный', 'Кухни и столовые')), findsOneWidget);
  });

  appTest('обязательное фото: без снимка завершение не уходит, со снимком — с photoUrl', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    final FakeFilesRepository files = FakeFilesRepository();
    final FakePhotoCaptureService photos = FakePhotoCaptureService();
    await tester.pumpWidget(
      wrap(
        overrides(
          operations: <TechOperation>[techOperation(id: 'op1', requiresPhoto: true)],
          tickets: tickets,
          files: files,
          photos: photos,
        ),
      ),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.photoRequired), findsOneWidget);

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
    await settle(tester);
    expect(find.text(ChecklistTexts.photoFirst), findsOneWidget);
    expect(tickets.completeCalls, isEmpty, reason: 'без фото завершение не отправляется');

    await tester.tap(find.byKey(const Key('checklist_op_photo_button_op1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('checklist_photo_preview')), findsOneWidget);
    expect(find.text(ChecklistTexts.photoSheetTitle('①')), findsOneWidget);

    await tester.tap(find.byKey(const Key('checklist_complete_with_photo_button')));
    await tester.pumpAndSettle();

    expect(photos.captureCalls, 1);
    expect(files.uploads.single['filePath'], '${Directory.systemTemp.path}/op1.jpg');
    expect(tickets.completeCalls.single['photoUrl'], 'http://files.test/photo.jpg');
    expect(tickets.completeCalls.single['requiresPhoto'], isTrue);
    expect(find.text(ChecklistTexts.completed), findsOneWidget);
  });

  appTest('маленький снимок отклоняется на клиенте', (tester) async {
    final FakePhotoCaptureService photos = FakePhotoCaptureService(width: 640, height: 480);
    final FakeFilesRepository files = FakeFilesRepository();
    await tester.pumpWidget(
      wrap(
        overrides(
          operations: <TechOperation>[techOperation(id: 'op1', requiresPhoto: true)],
          photos: photos,
          files: files,
        ),
      ),
    );
    await settle(tester);

    await tester.tap(find.byKey(const Key('checklist_op_photo_button_op1')));
    await tester.pumpAndSettle();

    expect(find.text(ChecklistTexts.photoTooSmall), findsOneWidget);
    expect(files.uploads, isEmpty);
    expect(photos.deleted, isNotEmpty, reason: 'негодный снимок удаляется с устройства');
  });

  appTest('«Завершить помещение» заблокировано неполным чек-листом', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    await tester.pumpWidget(wrap(overrides(operations: twoOperations(), tickets: tickets)));
    await settle(tester);

    expect(find.text(ChecklistTexts.completeRoomWithLeft(2)), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_room_complete_button'))).onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
    await settle(tester);
    expect(find.text(ChecklistTexts.completeRoomWithLeft(1)), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_room_complete_button'))).onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op2')));
    await settle(tester);
    expect(find.text(ChecklistTexts.allOperationsDone), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_room_complete_button'))).onPressed,
      isNotNull,
    );

    await tester.tap(find.byKey(const Key('checklist_room_complete_button')));
    await tester.pumpAndSettle();

    final ProviderContainer container = ProviderScope.containerOf(
      tester.element(find.byKey(const Key('checklist_page'))),
    );
    final RouteDay day = container.read(routeDayProvider(eventId)).valueOrNull!;
    expect(day.done, 1, reason: 'точка маршрута отмечена пройденной');
    expect(find.text(ChecklistTexts.roomCompleted), findsOneWidget);
  });

  appTest('без сети завершение уходит в очередь, а не падает ошибкой', (tester) async {
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue();
    final FakeTicketsRepository tickets = FakeTicketsRepository(
      completeFailure: const NetworkFailure(),
    );
    await tester.pumpWidget(
      wrap(overrides(operations: twoOperations(), tickets: tickets, queue: queue)),
    );
    await settle(tester);

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
    await tester.pumpAndSettle();

    expect(await queue.pendingCount(), 1);
    final PendingAction action = (await queue.all()).single;
    expect(action.type, PendingActionTypes.operationCompleted);
    expect(action.payload['operationId'], 'op1');
    expect(action.payload['ticketId'], 'ticket-1');
    expect(action.payload['roomId'], 'room-1');
    expect(action.idempotencyKey, 'op:ticket-1:room-1:op1');

    expect(find.byKey(const Key('checklist_op_queued_op1')), findsOneWidget);
    expect(find.text(ChecklistTexts.sending), findsOneWidget);
    expect(find.byKey(const Key('checklist_offline_banner')), findsOneWidget);
    expect(tickets.completeCalls.length, 1, reason: 'попытка отправки была ровно одна');
  });

  appTest('шапка: помещение с этажом, сводка техкарты и прогресс маршрута', (tester) async {
    await tester.pumpWidget(wrap(overrides(operations: twoOperations())));
    await settle(tester);

    expect(find.text('Санузел 101 · 3 этаж'), findsOneWidget);
    expect(find.text('Техкарта: Влажная уборка санузла · 2 операций · ~7 мин'), findsOneWidget);
    expect(find.byKey(const Key('checklist_progress_bar')), findsOneWidget);
    expect(find.text('Прогресс маршрута: 0 из 2 помещений'), findsOneWidget);
  });

  appTest('таймер операции идёт по wall-clock и предупреждает о превышении нормы', (tester) async {
    await tester.pumpWidget(
      wrap(overrides(operations: <TechOperation>[techOperation(id: 'op1', estimatedTimeMin: 2)])),
    );
    await settle(tester);

    expect(find.text('⏱ 00:00'), findsOneWidget);
    expect(find.text(ChecklistTexts.norm(2)), findsOneWidget);

    now = now.add(const Duration(minutes: 2, seconds: 14));
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('⏱ 02:14'), findsOneWidget);
    expect(find.text(ChecklistTexts.overNorm('00:14')), findsOneWidget);
  });

  appTest('смена не открыта: баннер и недоступные отметки', (tester) async {
    await tester.pumpWidget(
      wrap(
        overrides(
          operations: twoOperations(),
          event: checkedInEvent(id: eventId, status: 'PLANNED'),
        ),
      ),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.shiftNotOpen), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_op_complete_button_op1'))).onPressed,
      isNull,
    );
    expect(find.text('⏱ 00:00'), findsNothing, reason: 'таймеры не идут');
  });

  appTest('у смены нет заявки: отметки недоступны с текстом для бригадира', (tester) async {
    await tester.pumpWidget(
      wrap(
        overrides(
          operations: twoOperations(),
          event: checkedInEvent(id: eventId, ticketId: null),
        ),
      ),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.noTicket), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_op_complete_button_op1'))).onPressed,
      isNull,
    );
  });

  appTest('техкарта не назначена: пустое состояние с кнопкой «Считаю помещение выполненным»', (tester) async {
    await tester.pumpWidget(
      wrap(
        overrides(
          operations: <TechOperation>[],
          room: roomWithTechCard(techCardId: null),
        ),
      ),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.noTechCard), findsOneWidget);
    expect(find.byKey(const Key('checklist_no_techcard_complete_button')), findsOneWidget);
    expect(find.byKey(const Key('checklist_room_complete_button')), findsNothing);
  });

  appTest('пустая техкарта: помещение можно завершить', (tester) async {
    await tester.pumpWidget(wrap(overrides(operations: <TechOperation>[])));
    await settle(tester);

    expect(find.text(ChecklistTexts.noOperations), findsOneWidget);
    expect(find.text(ChecklistTexts.askSupervisor), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_room_complete_button'))).onPressed,
      isNotNull,
    );
  });

  appTest('ошибка загрузки: «Не удалось загрузить чек-лист» и «Повторить»', (tester) async {
    // Помещение не отдаётся сервером — экран показывает ошибку с повтором.
    // Подмена по имени провайдера, а не по индексу списка: порядок overrides
    // менялся при добавлении drift-базы (М6.7), и индекс ломал тест.
    await tester.pumpWidget(
      wrap(overrides(operations: twoOperations(), core: FakeCoreRepository())),
    );
    await settle(tester);

    expect(find.text(ChecklistTexts.loadFailed), findsOneWidget);
    expect(find.byKey(const Key('checklist_error_retry')), findsOneWidget);
  });

  appTest('серверная ошибка завершения: баннер с повтором, операция не закрыта', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository(
      completeFailure: const ServerFailure('Сервис недоступен'),
    );
    await tester.pumpWidget(wrap(overrides(operations: twoOperations(), tickets: tickets)));
    await settle(tester);

    await tester.tap(find.byKey(const Key('checklist_op_complete_button_op1')));
    await tester.pumpAndSettle();

    expect(find.text(ChecklistTexts.completeFailed), findsOneWidget);
    expect(find.text(ChecklistTexts.completed), findsNothing);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('checklist_op_complete_button_op2'))).onPressed,
      isNull,
      reason: 'статус не меняется оптимистично',
    );
  });

  group('ChecklistController', () {
    // Кэш пишется фоновыми задачами (`_persist` → batch drift), поэтому перед
    // закрытием базы ждём опустошения очереди событий: иначе drift падает с
    // «This database has already been closed» уже после завершения теста.
    tearDown(() async {
      await pumpEventQueue();
      await database.close();
    });

    ProviderContainer container({
      required List<TechOperation> operations,
      FakeTicketsRepository? tickets,
      ScheduleEvent? event,
    }) {
      final ProviderContainer c = ProviderContainer(
        overrides: overrides(
          operations: operations,
          tickets: tickets,
          event: event,
        ),
      );
      addTearDown(c.dispose);
      return c;
    }

    test('блокировка шагов снимается по порядку, таймер следующей стартует', () async {
      final ProviderContainer c = container(operations: twoOperations());
      final ChecklistState state = await c.read(checklistProvider(args).future);

      expect(state.isLocked(0), isFalse);
      expect(state.isLocked(1), isTrue);
      expect(state.operations.first.isActive, isTrue);
      expect(state.operations.first.startedAtLocal, isNotNull);
      expect(state.operations[1].startedAtLocal, isNull);

      await c.read(checklistProvider(args).notifier).completeOperation('op1');
      final ChecklistState after = c.read(checklistProvider(args)).valueOrNull!;

      expect(after.isLocked(1), isFalse);
      expect(after.completedCount, 1);
      expect(after.remaining, 1);
      expect(after.operations[1].startedAtLocal, isNotNull, reason: 'таймер второй операции пошёл');
    });

    test('повторное завершение возвращает «Операция уже была отмечена»', () async {
      final FakeTicketsRepository tickets = FakeTicketsRepository();
      final ProviderContainer c = container(operations: twoOperations(), tickets: tickets);
      await c.read(checklistProvider(args).future);

      final ChecklistController controller = c.read(checklistProvider(args).notifier);
      expect(await controller.completeOperation('op1'), isNull);
      expect(await controller.completeOperation('op1'), ChecklistTexts.alreadyCompleted);
      expect(tickets.completeCalls.length, 1);
    });

    test('превышение нормы считается по норме операции', () async {
      final ProviderContainer c = container(
        operations: <TechOperation>[techOperation(id: 'op1', estimatedTimeMin: 2)],
      );
      final ChecklistState state = await c.read(checklistProvider(args).future);
      final ChecklistOperationState op = state.operations.single;

      expect(op.overtime(now), isNull);
      expect(op.overtime(now.add(const Duration(minutes: 3))), const Duration(minutes: 1));
      expect(op.elapsed(now.add(const Duration(seconds: 30))), const Duration(seconds: 30));
    });

    test('ручной старт перезапускает отсчёт операции', () async {
      final ProviderContainer c = container(operations: twoOperations());
      await c.read(checklistProvider(args).future);

      now = now.add(const Duration(minutes: 1));
      c.read(checklistProvider(args).notifier).startOperation('op1');
      final ChecklistState state = c.read(checklistProvider(args)).valueOrNull!;
      expect(state.operations.first.startedAtLocal, now);
      expect(state.operations.first.elapsed(now), Duration.zero);
    });
  });
}
