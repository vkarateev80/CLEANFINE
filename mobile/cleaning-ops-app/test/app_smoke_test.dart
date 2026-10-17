import 'package:cleaning_ops_app/app.dart';
import 'package:cleaning_ops_app/core/app_product.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'helpers/gps_fakes.dart';
import 'helpers/operator_fakes.dart';

/// Тесты каркаса М6.0: роутер, guard авторизации, таб-бар и кнопка SOS.
/// Хранилище подменяется in-memory реализацией — платформенные каналы не нужны.
void main() {
  // Даты на экранах форматируются по-русски (`main.dart` делает это при старте).
  setUpAll(() async => initializeDateFormatting('ru'));

  // Каркас приложения запускает GPS-трекинг: без подмены он пошёл бы в базу
  // (платформенный `path_provider`) и геолокацию. Одна база на файл — drift
  // предупреждает, если открыть несколько экземпляров сразу.
  late AppDatabase database;
  setUpAll(() => database = AppDatabase.memory());
  tearDownAll(() => database.close());

  List<Override> shellOverrides(SecureStorageService storage) => <Override>[
        secureStorageProvider.overrideWithValue(storage),
        gpsTrackingServiceProvider.overrideWithValue(
          StubGpsTrackingService(const GpsTrackingState(), database),
        ),
      ];

  testWidgets('без сессии приложение уводит со splash на экран входа', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: shellOverrides(_InMemoryStorage()),
        child: const CleaningOpsApp(),
      ),
    );

    // Первый кадр — splash, пока сессия не прочитана.
    expect(find.byKey(const Key('splash_page')), findsOneWidget);

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('login_page')), findsOneWidget);
    expect(find.byKey(const Key('splash_page')), findsNothing);
  });

  testWidgets('с сохранённой сессией открывается «Сегодня» с таб-баром и SOS', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh')
      ..seed(StorageKeys.userId, 'user-1')
      ..seed(StorageKeys.role, 'OPERATOR');

    await tester.pumpWidget(
      ProviderScope(
        overrides: shellOverrides(storage),
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('today_page')), findsOneWidget);
    expect(find.byKey(const Key('shell_bottom_nav')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_today')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_chats')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_profile')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_admin')), findsNothing);
    expect(find.byKey(const Key('shell_tab_sos')), findsOneWidget);
    expect(find.byKey(const Key('login_page')), findsNothing);
  });

  testWidgets('«Оператор»: у ADMIN те же три вкладки, доски действий здесь нет', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh')
      ..seed(StorageKeys.userId, 'user-1')
      ..seed(StorageKeys.role, 'ADMIN');

    await tester.pumpWidget(
      ProviderScope(
        overrides: shellOverrides(storage),
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('today_page')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_admin')), findsNothing);
    expect(find.byKey(const Key('shell_tab_profile')), findsOneWidget);
  });

  /// Продукт «Команда» (`main_team.dart`): переопределяем провайдер продукта.
  List<Override> teamOverrides(SecureStorageService storage) => <Override>[
        ...shellOverrides(storage),
        appProductProvider.overrideWithValue(ProductConfig.of(AppProduct.team)),
      ];

  testWidgets('«Команда»: ADMIN попадает на доску действий, без SOS и «Сегодня»', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh')
      ..seed(StorageKeys.userId, 'user-1')
      ..seed(StorageKeys.role, 'ADMIN');

    await tester.pumpWidget(
      ProviderScope(
        overrides: teamOverrides(storage),
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('admin_page')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_admin')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_chats')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_profile')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_today')), findsNothing);
    expect(find.byKey(const Key('shell_tab_client')), findsNothing);
    expect(find.byKey(const Key('shell_tab_sos')), findsNothing);
    expect(find.byKey(const Key('today_page')), findsNothing);
  });

  testWidgets('«Команда»: SUPERVISOR тоже видит доску', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh')
      ..seed(StorageKeys.userId, 'user-1')
      ..seed(StorageKeys.role, 'SUPERVISOR');

    await tester.pumpWidget(
      ProviderScope(
        overrides: teamOverrides(storage),
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('shell_tab_admin')), findsOneWidget);
    expect(find.byKey(const Key('admin_page')), findsOneWidget);
  });

  testWidgets('«Команда»: CLIENT попадает в портал заказчика, доски не видит', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh')
      ..seed(StorageKeys.userId, 'user-1')
      ..seed(StorageKeys.role, 'CLIENT');

    await tester.pumpWidget(
      ProviderScope(
        overrides: teamOverrides(storage),
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('client_home_page')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_client')), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_admin')), findsNothing);
    expect(find.byKey(const Key('shell_tab_sos')), findsNothing);
  });

  testWidgets('нажатие SOS открывает полноэкранную аварийную заявку', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh');

    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          ...shellOverrides(storage),
          // Экран SOS читает смену, координаты и очередь действий: без подмены тест
          // упирался бы в реальную сеть и платформенный канал геолокации.
          scheduleRepositoryProvider.overrideWithValue(FakeScheduleRepository()),
          locationServiceProvider.overrideWithValue(FakeLocationService()),
          pendingActionQueueProvider.overrideWithValue(InMemoryPendingActionQueue()),
        ],
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    await tester.tap(find.byKey(const Key('shell_tab_sos')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('sos_page')), findsOneWidget);
  });
}

/// In-memory подмена secure storage: приложение работает с ней как с настоящей.
class _InMemoryStorage extends SecureStorageService {
  final Map<String, String> _values = {};

  void seed(String key, String value) => _values[key] = value;

  @override
  Future<String?> readAccessToken() async => _values[StorageKeys.accessToken];

  @override
  Future<String?> readRefreshToken() async => _values[StorageKeys.refreshToken];

  @override
  Future<String?> readUserId() async => _values[StorageKeys.userId];

  @override
  Future<String?> readRole() async => _values[StorageKeys.role];

  @override
  Future<String?> readBiometricKey() async => _values[StorageKeys.biometricKey];

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    _values[StorageKeys.accessToken] = accessToken;
    _values[StorageKeys.refreshToken] = refreshToken;
  }

  @override
  Future<void> clearTokens() async {
    _values.remove(StorageKeys.accessToken);
    _values.remove(StorageKeys.refreshToken);
  }

  @override
  Future<void> saveUserId(String value) async => _values[StorageKeys.userId] = value;

  @override
  Future<void> saveRole(String value) async => _values[StorageKeys.role] = value;

  @override
  Future<void> saveBiometricKey(String value) async => _values[StorageKeys.biometricKey] = value;

  @override
  Future<void> deleteBiometricKey() async => _values.remove(StorageKeys.biometricKey);

  @override
  Future<void> clearSession() async {
    await clearTokens();
    _values.remove(StorageKeys.userId);
    _values.remove(StorageKeys.role);
  }
}
