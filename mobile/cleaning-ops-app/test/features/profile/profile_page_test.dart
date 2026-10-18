import 'dart:io';

import 'package:cleaning_ops_app/core/constants/app_constants.dart';
import 'package:cleaning_ops_app/app.dart';
import 'package:cleaning_ops_app/core/errors/exceptions.dart';
import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/auth_providers.dart';
import 'package:cleaning_ops_app/features/profile/data/models/notification_models.dart';
import 'package:cleaning_ops_app/features/profile/presentation/pages/profile_page.dart';
import 'package:cleaning_ops_app/features/profile/presentation/profile_formatters.dart';
import 'package:cleaning_ops_app/features/profile/presentation/providers/profile_providers.dart';
import 'package:cleaning_ops_app/services/cache_maintenance.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/floor_plan_cache.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/gps_fakes.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/operator_fakes.dart';
import '../../helpers/profile_fakes.dart';
import '../../helpers/screen_harness.dart';

/// М6.8: экран профиля — DS-002 `profile.md` §3.1–§3.5, §10.
///
/// База — drift в памяти, сеть подменена на уровне **источника данных**
/// auth-service: так проверяется настоящий путь `AuthRepository` → сессия →
/// роутер, а не заглушка репозитория. Уборка (снять дерево и закрыть базу)
/// выполняется внутри тела теста — иначе `close()` в `tearDown` не завершается
/// никогда (грабли М6.7, `test/helpers/screen_harness.dart`).
///
/// Размер кэша подменяется [FakeCacheUsageTracker], а обслуживание кэша —
/// `fakeCacheMaintenance` поверх временного каталога: настоящий
/// `CacheMaintenance` зовёт `path_provider`, который в fake-async зоне
/// widget-теста не отвечает никогда, и `pumpAndSettle` ждал бы его вечно.
///
/// Экран прокручиваемый, а пункты ниже первого экрана `ListView` не строит:
/// на тестовом окне по умолчанию (800×600) не находится ни «Уведомления», ни
/// «Очистить кэш», ни кнопка «Выйти». Поэтому тесту выдан высокий экран —
/// тогда проверяются все пункты §6 сразу, а не то, что попало в окно.
void profileScreenTest(
  String description, {
  required Future<void> Function(WidgetTester tester, ProviderContainer container) body,
  FakeAuthRemote? remote,
  FakeNotificationsRepository? notifications,
  FakePushService? push,
  bool online = true,
  bool withApp = false,
  FakeCacheUsageTracker? cacheUsage,
  Directory? documents,
}) {
  testWidgets(description, (WidgetTester tester) async {
    // 800 × 2400 логических пикселей (DPR 1) — экран профиля целиком.
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(800, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final AppDatabase database = AppDatabase.memory();
    final Directory documentsDirectory = documents ?? tempDocumentsDirectory();
    // Очередь — в памяти: обслуживание кэша читает её пути фото, а тесту не нужен
    // drift ради одной проверки.
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue();
    final InMemorySecureStorage storage = InMemorySecureStorage()
      ..values[StorageKeys.accessToken] = 'access-token'
      ..values[StorageKeys.refreshToken] = 'refresh-token'
      ..values[StorageKeys.userId] = 'me'
      ..values[StorageKeys.role] = 'OPERATOR';
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        pendingActionQueueProvider.overrideWithValue(queue),
        secureStorageProvider.overrideWithValue(storage),
        authRemoteDataSourceProvider.overrideWithValue(remote ?? FakeAuthRemote()),
        notificationsRepositoryProvider.overrideWithValue(
          notifications ?? FakeNotificationsRepository(),
        ),
        pushServiceProvider.overrideWithValue(push ?? FakePushService()),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        locationServiceProvider.overrideWithValue(FakeLocationService()),
        gpsTrackingServiceProvider.overrideWithValue(
          StubGpsTrackingService(const GpsTrackingState(), database),
        ),
        cacheUsageProvider.overrideWith(
          (Ref ref) => (cacheUsage ?? FakeCacheUsageTracker()).usage(),
        ),
        cacheMaintenanceProvider.overrideWithValue(
          fakeCacheMaintenance(database: database, queue: queue, directory: documentsDirectory),
        ),
      ],
    );

    try {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: withApp ? const CleaningOpsApp() : const MaterialApp(home: ProfilePage()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      await body(tester, container);
    } finally {
      // Никакого `container.dispose()` между снятием дерева и закрытием базы:
      // он отписывает drift-поток (`outgoingCountProvider`) уже ПОСЛЕ последнего
      // `pump`, `StreamQueryStore.markAsClosed` планирует `Timer.run`, а
      // `StreamQueryStore.close()` ждёт его completion — в fake-async зоне это
      // ожидание не заканчивается никогда. Контейнер освобождает сам
      // `UncontrolledProviderScope` при снятии дерева; страховка от чужого
      // порядка уборки — дренаж очереди внутри [closeDatabase].
      await disposeScreen(tester);
      await closeDatabase(database);
    }
  });
}

void main() {
  profileScreenTest(
    'карточка: ФИО, роль словарём, телефон, инициалы аватара',
    body: (WidgetTester tester, ProviderContainer container) async {
    expect(find.byKey(const Key('profile_name_text')), findsOneWidget);
    expect(find.text('Иванов Иван Иванович'), findsOneWidget);
    // §10.4: роль отображается словарём — сырого `OPERATOR` в интерфейсе нет.
    expect(find.byKey(const Key('profile_role_text')), findsOneWidget);
    expect(find.text('Оператор'), findsOneWidget);
    expect(find.textContaining('OPERATOR'), findsNothing);
    expect(find.text('+7 999 000-00-03'), findsOneWidget);
    // Аватара нет: заглушка с инициалами.
    expect(find.text('ИИ'), findsOneWidget);
    // Пункты профиля из §6 на месте.
    expect(find.byKey(const Key('profile_change_pin_tile')), findsOneWidget);
    expect(find.byKey(const Key('profile_change_password_tile')), findsOneWidget);
    expect(find.byKey(const Key('profile_queue_tile')), findsOneWidget);
      expect(find.byKey(const Key('profile_about_tile')), findsOneWidget);
      expect(find.text('версия ${AppConstants.version}'), findsOneWidget);
    },
  );

  profileScreenTest(
    '§10.2: настройки уведомлений — инверсия disabledTypes при сохранении',
    notifications: FakeNotificationsRepository(
      settings: const NotificationSettings(
        disabledTypes: <String>['MATERIAL_LOW'],
        availableTypes: <String>['EMERGENCY', 'MATERIAL_LOW'],
      ),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.tap(find.byKey(const Key('profile_notifications_tile')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('profile_notifications_sheet')), findsOneWidget);
      // `MATERIAL_LOW` в `disabledTypes` — тумблер выключен; `EMERGENCY` включён.
      expect(_switchValue(tester, 'MATERIAL_LOW'), isFalse);
      expect(_switchValue(tester, 'EMERGENCY'), isTrue);

      // Включаем «Материал ниже нормы» и сохраняем.
      await tester.tap(find.byKey(const Key('profile_notification_switch_MATERIAL_LOW')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_notifications_save_button')));
      await tester.pumpAndSettle();

      final FakeNotificationsRepository repository =
          container.read(notificationsRepositoryProvider) as FakeNotificationsRepository;
      expect(repository.savedDisabledTypes, hasLength(1));
      expect(repository.savedDisabledTypes.single, isNot(contains('MATERIAL_LOW')));
    },
  );

  profileScreenTest(
    'настройки уведомлений: 400 от сервера показывается в шторке',
    notifications: FakeNotificationsRepository(
      settings: const NotificationSettings(
        disabledTypes: <String>[],
        availableTypes: <String>['EMERGENCY'],
      ),
      saveFailure: const ValidationFailure('Недопустимый тип уведомления'),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.tap(find.byKey(const Key('profile_notifications_tile')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_notifications_save_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('profile_notifications_error_text')), findsOneWidget);
      expect(find.text('Недопустимый тип уведомления'), findsOneWidget);
    },
  );

  profileScreenTest(
    'ошибка загрузки настроек: баннер «Не удалось загрузить настройки»',
    notifications: FakeNotificationsRepository(
      settingsFailure: const ServerFailure('Сервис недоступен'),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.tap(find.byKey(const Key('profile_notifications_tile')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('profile_notifications_load_error_text')), findsOneWidget);
      expect(find.text('Не удалось загрузить настройки'), findsOneWidget);
      expect(find.byKey(const Key('profile_notifications_retry_button')), findsOneWidget);
    },
  );

  profileScreenTest(
    '§10.1: выход очищает сессию и уводит на /login',
    withApp: true,
    body: (WidgetTester tester, ProviderContainer container) async {
      final InMemorySecureStorage tokens =
          container.read(secureStorageProvider) as InMemorySecureStorage;
      expect(tokens.values[StorageKeys.accessToken], 'access-token');

      // Каркас приложения: вкладка «Профиль».
      await tester.tap(find.byKey(const Key('shell_tab_profile')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile_page')), findsOneWidget);

      await tester.tap(find.byKey(const Key('profile_logout_button')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile_logout_dialog')), findsOneWidget);
      expect(find.text('Выйти из аккаунта?'), findsOneWidget);

      await tester.tap(find.byKey(const Key('profile_logout_confirm_button')));
      await tester.pumpAndSettle();

      // Роутер оказался на `/login`, токенов больше нет.
      expect(find.byKey(const Key('login_page')), findsOneWidget);
      expect(tokens.values.containsKey(StorageKeys.accessToken), isFalse);
      expect(tokens.values.containsKey(StorageKeys.refreshToken), isFalse);

      final FakeAuthRemote remote =
          container.read(authRemoteDataSourceProvider) as FakeAuthRemote;
      expect(remote.logoutCalls, 1);
      expect(remote.logoutRefreshTokens.single, 'refresh-token');
    },
  );

  profileScreenTest(
    'ошибка профиля: «Не удалось загрузить профиль», выход доступен',
    remote: FakeAuthRemote(meFailure: const ServerException('Сервис недоступен')),
    body: (WidgetTester tester, ProviderContainer container) async {
      expect(find.byKey(const Key('profile_error_text')), findsOneWidget);
      expect(find.text('Не удалось загрузить профиль'), findsOneWidget);
      expect(find.byKey(const Key('profile_logout_button')), findsOneWidget);
    },
  );

  // Регрессия М6.8: размер кэша считается через `path_provider`, и пока он не
  // посчитан, экран профиля обязан оставаться живым. Раньше первый же
  // `pumpAndSettle` в этом файле ждал вечно и тест висел целиком.
  profileScreenTest(
    'раздел кэша: размер ещё считается — экран жив и не блокируется',
    cacheUsage: FakeCacheUsageTracker(), // `usage()` никогда не завершается
    body: (WidgetTester tester, ProviderContainer container) async {
      // Никаких `pumpAndSettle`: ждать завершения расчёта кэша нельзя — именно
      // на этом ожидании файл тестов висел (см. `FakeCacheUsageTracker`).
      await tester.pump();

      expect(find.byKey(const Key('profile_cache_section')), findsOneWidget);
      expect(find.byKey(const Key('profile_cache_size_tile')), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('profile_cache_size_text'))).data,
        '…',
      );
      // Предупреждения о нехватке места нет: размер ещё неизвестен.
      expect(find.byKey(const Key('profile_cache_low_space_text')), findsNothing);

      // Карточка профиля и пункты отрисованы, выход доступен — экран не замер.
      expect(find.byKey(const Key('profile_name_text')), findsOneWidget);
      expect(find.byKey(const Key('profile_clear_cache_tile')), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byKey(const Key('profile_logout_button'))).onPressed,
        isNotNull,
      );
    },
  );

  profileScreenTest(
    'раздел кэша: посчитанный размер показан, места достаточно',
    cacheUsage: FakeCacheUsageTracker(value: const CacheUsage(
      plansBytes: 12 * 1024 * 1024,
      photosBytes: 0,
      databaseBytes: 0,
    )),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.pumpAndSettle();

      expect(
        tester.widget<Text>(find.byKey(const Key('profile_cache_size_text'))).data,
        '12,0 МБ',
      );
      expect(find.byKey(const Key('profile_cache_low_space_text')), findsNothing);
    },
  );

  profileScreenTest(
    'раздел кэша: мало места — предупреждение «Мало места: {N} МБ»',
    cacheUsage: FakeCacheUsageTracker(
      value: const CacheUsage(
        plansBytes: 150 * 1024 * 1024,
        photosBytes: 60 * 1024 * 1024,
        databaseBytes: 0,
      ),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.pumpAndSettle();

      expect(
        tester.widget<Text>(find.byKey(const Key('profile_cache_size_text'))).data,
        // От 100 МБ десятые доли не показываются (`CacheUsage.label`) — так
        // строка совпадает с текстом предупреждения ниже («210 МБ»).
        '210 МБ',
      );
      expect(find.byKey(const Key('profile_cache_low_space_text')), findsOneWidget);
      expect(find.text('Мало места: 210 МБ. Очистите кэш.'), findsOneWidget);
    },
  );

  profileScreenTest(
    'раздел кэша: «Очистить кэш планов и фото» удаляет файлы после подтверждения',
    cacheUsage: FakeCacheUsageTracker(value: const CacheUsage(
      plansBytes: 5 * 1024 * 1024,
      photosBytes: 0,
      databaseBytes: 0,
    )),
    body: (WidgetTester tester, ProviderContainer container) async {
      // Каталог документов — временная папка хоста (`FakeCacheMaintenance`
      // подставляет её вместо `path_provider`). Кладём в неё файл плана:
      // подтверждённая очистка обязана его снести.
      final FakeCacheMaintenance maintenance =
          container.read(cacheMaintenanceProvider) as FakeCacheMaintenance;
      final Directory plans =
          Directory('${maintenance.directory.path}/${FloorPlanCache.directoryName}')
            ..createSync(recursive: true);
      File('${plans.path}/plan.png').writeAsStringSync('plan');

      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_clear_cache_tile')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('profile_clear_cache_dialog')), findsOneWidget);
      expect(
        find.text('Очистить кэш? Планы и отправленные фото будут скачаны заново.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('profile_clear_cache_confirm')));
      await tester.pumpAndSettle();

      expect(plans.existsSync(), isFalse);
    },
  );

  test('подписи типов уведомлений и счётчик включённых', () {
    expect(NotificationTypes.label('EMERGENCY'), 'Аварийные заявки');
    expect(NotificationTypes.label('MATERIAL_LOW'), 'Материал ниже нормы');
    expect(NotificationTypes.label('SCHEDULE_MISSED'), 'Неявка на смену');
    // Незнакомый тип показывается как есть — не пустой строкой.
    expect(NotificationTypes.label('NEW_TYPE'), 'NEW_TYPE');

    const NotificationSettings settings = NotificationSettings(
      disabledTypes: <String>['MATERIAL_LOW', 'GEOFENCE_EXIT'],
      availableTypes: <String>[
        'EMERGENCY',
        'NEW_TICKET',
        'TICKET_OVERDUE',
        'CHAT_MESSAGE',
        'GEOFENCE_EXIT',
        'MATERIAL_LOW',
        'SCHEDULE_MISSED',
      ],
    );
    expect(settings.enabledCount, 5);
    expect(settings.label, 'Включены (5 из 7)');
    // Тумблер включён → тип уходит из `disabledTypes` (семантика сервера обратна UI).
    expect(
      settings.withEnabled('MATERIAL_LOW', true).disabledTypes,
      isNot(contains('MATERIAL_LOW')),
    );
    expect(settings.withEnabled('EMERGENCY', false).disabledTypes, contains('EMERGENCY'));
    // Порядок шторки — как в макете §2.
    expect(settings.orderedTypes.first, 'EMERGENCY');
    expect(settings.orderedTypes.last, 'SCHEDULE_MISSED');
  });

  test('формат телефона и инициалы', () {
    expect(formatPhone('+79990000003'), '+7 999 000-00-03');
    expect(formatPhone('89990000003'), '+7 999 000-00-03');
    expect(formatPhone(null), '');
    expect(formatPhone('+49 30 123456'), '+49 30 123456');
    expect(initialsOf('Иванов Иван Иванович'), 'ИИ');
    expect(initialsOf('Пётр'), 'П');
    expect(initialsOf(''), '?');
  });
}

bool _switchValue(WidgetTester tester, String type) {
  return tester
      .widget<SwitchListTile>(find.byKey(Key('profile_notification_switch_$type')))
      .value;
}
