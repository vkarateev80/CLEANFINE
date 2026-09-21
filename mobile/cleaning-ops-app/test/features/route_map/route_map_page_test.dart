import 'package:cleaning_ops_app/core/theme/app_colors.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/route_map/presentation/pages/route_map_page.dart';
import 'package:cleaning_ops_app/features/route_map/presentation/providers/route_providers.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../../helpers/screen_harness.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/operator_fakes.dart';

/// М6.3: сценарии из `design/screens/mobile/route_map.md` §10 — отрисовка точек,
/// статусы, «Следующая точка» и список без плана.
/// Экран читает кэш первым (М6.7), поэтому база — drift в памяти, отдельная на тест.
void main() {
  setUpAll(() async => initializeDateFormatting('ru'));

  const String eventId = 'ev1';

  late AppDatabase database;

  /// Widget-тест экрана поверх drift-базы файла: `screenTest` снимает дерево и
  /// закрывает базу внутри тела теста (иначе `flutter test` зависает — см.
  /// `test/helpers/screen_harness.dart`).
  void appTest(String description, Future<void> Function(WidgetTester tester) body) {
    screenTest(description, body, database: () => database);
  }

  setUp(() => database = AppDatabase.memory());

  RouteDetail routeWithPoints({List<RoutePointView>? points}) {
    return RouteDetail(
      id: 'r1',
      name: 'Маршрут 1 этажа',
      status: 'ACTIVE',
      floorId: 'f1',
      points: points ??
          const <RoutePointView>[
            RoutePointView(
              id: 'p1',
              roomId: 'r1',
              orderIndex: 0,
              roomName: 'Санузел',
              coordsX: 100,
              coordsY: 100,
              coordsWidth: 60,
              coordsHeight: 40,
            ),
            RoutePointView(
              id: 'p2',
              roomId: 'r2',
              orderIndex: 1,
              roomName: 'Кухня',
              coordsX: 400,
              coordsY: 300,
              coordsWidth: 60,
              coordsHeight: 40,
            ),
          ],
    );
  }

  Widget wrap({
    required FakeScheduleRepository schedule,
    required FakeCoreRepository core,
    bool online = true,
  }) {
    return ProviderScope(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        scheduleRepositoryProvider.overrideWithValue(schedule),
        coreRepositoryProvider.overrideWithValue(core),
        ticketsRepositoryProvider.overrideWithValue(FakeTicketsRepository()),
        locationServiceProvider.overrideWithValue(FakeLocationService()),
      ],
      child: const MaterialApp(home: RouteMapPage(eventId: eventId)),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  FakeScheduleRepository scheduleWithEvent() => FakeScheduleRepository(
        events: <ScheduleEvent>[plannedEvent(id: eventId, status: 'CHECKED_IN', routeId: 'r1')],
      );

  appTest('план: точки отрисованы по координатам и пронумерованы', (tester) async {
    await tester.pumpWidget(
      wrap(
        schedule: scheduleWithEvent(),
        core: FakeCoreRepository(
          routeDetail: routeWithPoints(),
          floorPlan: const FloorPlan(
            id: 'f1',
            number: 1,
            planImageUrl: 'http://plans.test/floor1.png',
            planWidth: 800,
            planHeight: 600,
          ),
        ),
      ),
    );
    await settle(tester);

    expect(find.byKey(const Key('route_point_marker_p1')), findsOneWidget);
    expect(find.byKey(const Key('route_point_marker_p2')), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);

    // Координаты p2 правее и ниже p1 — центр маркера должен быть смещён так же.
    final Offset first = tester.getCenter(find.byKey(const Key('route_point_marker_p1')));
    final Offset second = tester.getCenter(find.byKey(const Key('route_point_marker_p2')));
    expect(second.dx, greaterThan(first.dx));
    expect(second.dy, greaterThan(first.dy));

    expect(find.byKey(const Key('route_progress_text')), findsOneWidget);
    expect(find.text('Маршрут: 0 из 2 помещений'), findsOneWidget);
  });

  appTest('статусы на плане видны скринридеру: первая «В работе», вторая «Ожидает»', (tester) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(
      wrap(
        schedule: scheduleWithEvent(),
        core: FakeCoreRepository(
          routeDetail: routeWithPoints(),
          floorPlan: const FloorPlan(
            id: 'f1',
            number: 1,
            planImageUrl: 'http://plans.test/floor1.png',
            planWidth: 800,
            planHeight: 600,
          ),
        ),
      ),
    );
    await settle(tester);

    // Маркеры на плане — только номера, поэтому статус проверяем по Semantics-метке.
    expect(find.bySemanticsLabel('Точка 1, Санузел, В работе'), findsOneWidget);
    expect(find.bySemanticsLabel('Точка 2, Кухня, Ожидает'), findsOneWidget);
    handle.dispose();
  });

  appTest('без плана — режим списка с теми же статусами', (tester) async {
    await tester.pumpWidget(
      wrap(
        schedule: scheduleWithEvent(),
        core: FakeCoreRepository(routeDetail: routeWithPoints()),
      ),
    );
    await settle(tester);

    expect(find.byKey(const Key('route_points_list')), findsOneWidget);
    expect(find.text('План этажа недоступен'), findsOneWidget);
    expect(find.byKey(const Key('route_point_tile_p1')), findsOneWidget);
    expect(find.byKey(const Key('route_point_tile_p2')), findsOneWidget);
  });

  appTest('пропуск точки: короткая причина отклоняется, верная — сохраняется', (tester) async {
    await tester.pumpWidget(
      wrap(
        schedule: scheduleWithEvent(),
        core: FakeCoreRepository(routeDetail: routeWithPoints()),
      ),
    );
    await settle(tester);

    await tester.tap(find.byKey(const Key('route_skip_button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route_skip_sheet')), findsOneWidget);

    await tester.tap(find.byKey(const Key('route_skip_confirm_button')));
    await tester.pumpAndSettle();
    expect(find.text('Укажите причину (не короче 3 символов)'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('route_skip_reason_field')), 'нет доступа');
    await tester.tap(find.byKey(const Key('route_skip_confirm_button')));
    await tester.pumpAndSettle();

    expect(find.text('Пропущено'), findsOneWidget);
    expect(find.text('Маршрут: 0 из 2 помещений'), findsOneWidget);
  });

  appTest('смена без маршрута показывает «Маршрут не назначен»', (tester) async {
    await tester.pumpWidget(
      wrap(
        schedule: FakeScheduleRepository(
          events: <ScheduleEvent>[plannedEvent(id: eventId, routeId: null)],
        ),
        core: FakeCoreRepository(),
      ),
    );
    await settle(tester);

    expect(find.text('Маршрут не назначен'), findsOneWidget);
    expect(find.text('Обратитесь к бригадиру'), findsOneWidget);
  });

  group('RouteDayController', () {
    // Кэш пишется фоновыми задачами (`_persist` → batch drift), поэтому перед
    // закрытием базы ждём опустошения очереди событий: иначе drift падает с
    // «This database has already been closed» уже после завершения теста.
    tearDown(() async {
      await pumpEventQueue();
      await database.close();
    });

    ProviderContainer container({required RouteDetail route}) {
      final container = ProviderContainer(
        overrides: <Override>[
          appDatabaseProvider.overrideWithValue(database),
          scheduleRepositoryProvider.overrideWithValue(scheduleWithEvent()),
          coreRepositoryProvider.overrideWithValue(
            FakeCoreRepository(
              routeDetail: route,
              floorPlan: const FloorPlan(id: 'f1', number: 1),
            ),
          ),
          locationServiceProvider.overrideWithValue(FakeLocationService()),
        ],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('прогресс растёт при завершении и пропуске, активная точка сдвигается', () async {
      final ProviderContainer c = container(route: routeWithPoints());
      final RouteDay loaded = await c.read(routeDayProvider(eventId).future);
      expect(loaded.total, 2);
      expect(loaded.active!.point.id, 'p1');
      expect(loaded.done, 0);

      c.read(routeDayProvider(eventId).notifier).skipRoom('r1', 'нет доступа');
      RouteDay day = c.read(routeDayProvider(eventId)).valueOrNull!;
      expect(day.points.first.status, RoutePointStatus.skipped);
      expect(day.points.first.skipReason, 'нет доступа');
      expect(day.active!.point.id, 'p2', reason: 'активной стала следующая точка');

      c.read(routeDayProvider(eventId).notifier).markRoomDone('r2');
      day = c.read(routeDayProvider(eventId)).valueOrNull!;
      expect(day.done, 1);
      expect(day.isFinished, isTrue);

      c.read(routeDayProvider(eventId).notifier).reset();
      day = c.read(routeDayProvider(eventId)).valueOrNull!;
      expect(day.done, 0);
      expect(day.points.first.status, RoutePointStatus.active);
    });
  });
}
