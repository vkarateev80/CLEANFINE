import 'package:cleaning_ops_app/app.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'helpers/operator_fakes.dart';

/// Тесты каркаса М6.0: роутер, guard авторизации, таб-бар и кнопка SOS.
/// Хранилище подменяется in-memory реализацией — платформенные каналы не нужны.
void main() {
  // Даты на экранах форматируются по-русски (`main.dart` делает это при старте).
  setUpAll(() async => initializeDateFormatting('ru'));

  testWidgets('без сессии приложение уводит со splash на экран входа', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [secureStorageProvider.overrideWithValue(_InMemoryStorage())],
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
        overrides: [secureStorageProvider.overrideWithValue(storage)],
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
    expect(find.byKey(const Key('today_sos_button')), findsOneWidget);
    expect(find.byKey(const Key('login_page')), findsNothing);
  });

  testWidgets('нажатие SOS открывает полноэкранную аварийную заявку', (tester) async {
    final storage = _InMemoryStorage()
      ..seed(StorageKeys.accessToken, 'access')
      ..seed(StorageKeys.refreshToken, 'refresh');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureStorageProvider.overrideWithValue(storage),
          // Экран SOS читает смену и координаты: без подмены тест упирался бы
          // в реальную сеть и платформенный канал геолокации.
          scheduleRepositoryProvider.overrideWithValue(FakeScheduleRepository()),
          locationServiceProvider.overrideWithValue(FakeLocationService()),
        ],
        child: const CleaningOpsApp(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    await tester.tap(find.byKey(const Key('today_sos_button')));
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
