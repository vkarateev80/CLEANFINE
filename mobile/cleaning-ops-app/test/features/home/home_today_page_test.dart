import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/home/presentation/pages/home_today_page.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../../helpers/screen_harness.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/operator_fakes.dart';
import '../../helpers/auth_fakes.dart';

/// М6.3: сценарии widget-тестов из `design/screens/mobile/home_today.md` §10.
/// Экран читает кэш первым (М6.7), поэтому база — drift в памяти, отдельная на тест.
void main() {
  // Даты в интерфейсе — на русском, как и в приложении (`main.dart`).
  setUpAll(() async => initializeDateFormatting('ru'));

  late AppDatabase database;

  /// Widget-тест экрана поверх drift-базы файла: `screenTest` снимает дерево и
  /// закрывает базу внутри тела теста (иначе `flutter test` зависает — см.
  /// `test/helpers/screen_harness.dart`).
  void appTest(String description, Future<void> Function(WidgetTester tester) body) {
    screenTest(description, body, database: () => database);
  }

  setUp(() => database = AppDatabase.memory());

  Widget wrap({
    required FakeScheduleRepository schedule,
    FakeCoreRepository? core,
    FakeTicketsRepository? tickets,
    FakeLocationService? location,
    bool online = true,
  }) {
    return ProviderScope(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        sessionProvider.overrideWith(SignedInSession.new),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        scheduleRepositoryProvider.overrideWithValue(schedule),
        coreRepositoryProvider.overrideWithValue(core ?? FakeCoreRepository()),
        ticketsRepositoryProvider.overrideWithValue(tickets ?? FakeTicketsRepository()),
        locationServiceProvider.overrideWithValue(location ?? FakeLocationService()),
      ],
      child: const MaterialApp(home: HomeTodayPage()),
    );
  }

  /// Первая загрузка FutureProvider: два кадра — future и отрисовка данных.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  appTest('нет смены — пустое состояние и нет кнопки отметки', (tester) async {
    await tester.pumpWidget(wrap(schedule: FakeScheduleRepository()));
    await settle(tester);

    expect(find.byKey(const Key('today_empty_text')), findsOneWidget);
    expect(find.text('На смену сегодня вы не назначены'), findsOneWidget);
    expect(find.text('Смены назначает бригадир в графике'), findsOneWidget);
    expect(find.byKey(const Key('today_checkin_button')), findsNothing);
  });

  appTest('смена PLANNED: отметка прихода переводит смену в «Открыта»', (tester) async {
    final schedule = FakeScheduleRepository(
      events: <ScheduleEvent>[plannedEvent()],
      eventsAfterCheckIn: <ScheduleEvent>[plannedEvent(status: 'CHECKED_IN')],
    );
    await tester.pumpWidget(
      wrap(
        schedule: schedule,
        core: FakeCoreRepository(
          objectSummary: const ObjectSummary(id: 'object-1', name: 'БЦ Романов', address: 'ул. Ленина, 1'),
          routeDetail: const RouteDetail(
            id: 'route-1',
            name: 'Маршрут 1 этажа',
            status: 'ACTIVE',
            points: <RoutePointView>[
              RoutePointView(id: 'p-1', roomId: 'room-1', orderIndex: 1),
              RoutePointView(id: 'p-2', roomId: 'room-2', orderIndex: 2),
            ],
            totalEstimatedTimeMin: 40,
          ),
        ),
      ),
    );
    await settle(tester);

    expect(find.text('Вы ещё не вышли на смену. Отметка возможна только в зоне объекта'), findsOneWidget);
    expect(find.byKey(const Key('today_checkin_button')), findsOneWidget);
    expect(find.text('Маршрут: Маршрут 1 этажа · 2 помещений · ~40 мин'), findsOneWidget);

    await tester.tap(find.byKey(const Key('today_checkin_button')));
    await settle(tester);

    expect(schedule.checkInCalls, 1);
    expect(find.text('Открыта'), findsOneWidget);
    expect(find.byKey(const Key('today_route_button')), findsOneWidget);
    expect(find.byKey(const Key('today_checkout_button')), findsOneWidget);
  });

  appTest('403 на отметке прихода показывает текст сервера и не меняет статус', (tester) async {
    final schedule = FakeScheduleRepository(
      events: <ScheduleEvent>[plannedEvent()],
      checkInFailure: const ForbiddenFailure('Вы находитесь вне зоны объекта'),
    );
    await tester.pumpWidget(wrap(schedule: schedule));
    await settle(tester);

    await tester.tap(find.byKey(const Key('today_checkin_button')));
    await settle(tester);

    expect(find.text('Вы находитесь вне зоны объекта'), findsOneWidget);
    expect(find.text('Запланирована'), findsOneWidget);
    expect(find.byKey(const Key('today_checkin_button')), findsOneWidget);
  });

  appTest('ошибка загрузки смен — экран ошибки с повтором', (tester) async {
    final schedule = FakeScheduleRepository(eventsFailure: const NetworkFailure());
    await tester.pumpWidget(wrap(schedule: schedule));
    await settle(tester);

    expect(find.text('Не удалось загрузить смены'), findsOneWidget);
    expect(find.byKey(const Key('today_error_retry')), findsOneWidget);
  });

  appTest('смена без маршрута: кнопка маршрута не показывается у PLANNED', (tester) async {
    await tester.pumpWidget(
      wrap(schedule: FakeScheduleRepository(events: <ScheduleEvent>[plannedEvent(routeId: null)])),
    );
    await settle(tester);

    expect(find.text('Маршрут не назначен'), findsOneWidget);
    expect(find.byKey(const Key('today_route_button')), findsNothing);
  });
}
