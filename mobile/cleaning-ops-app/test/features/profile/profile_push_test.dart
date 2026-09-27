import 'dart:io';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/auth_providers.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/features/profile/data/models/notification_models.dart';
import 'package:cleaning_ops_app/features/profile/presentation/pages/profile_page.dart';
import 'package:cleaning_ops_app/features/profile/presentation/providers/profile_providers.dart';
import 'package:cleaning_ops_app/router/app_router.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:cleaning_ops_app/shared/widgets/push_listener.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/operator_fakes.dart';
import '../../helpers/profile_fakes.dart';
import '../../helpers/screen_harness.dart';

/// М6.8: push-уведомления — DS-002 `profile.md` §3.4 (`PushListener`).
///
/// В `profile_page_test.dart` push не проверялся ни одним тестом. Здесь закрыты
/// три обязательных случая вехи:
///  1. **регистрация устройства** — `POST /api/notifications/device` получает
///     токен Firebase и платформу (`android` | `ios`) — §3.4;
///  2. **приём уведомления** — `PushListener` переводит по `data.type` тем же
///     словарём, что и приложение: `CHAT_MESSAGE` → `/chats/{chatId}`,
///     заявки → `/today`, `GEOFENCE_EXIT` → `/profile`;
///  3. **отказ** — токена нет (Firebase не поднята) или сервер отказал:
///     приложение работает, ошибка не всплывает, токен регистрируется при
///     следующем входе.
///
/// Каркас — настоящие `PushListener` и `GoRouter` приложения. Корневой
/// `CleaningOpsApp` намеренно не поднимается: он тянет `path_provider` (кэш
/// аватара, размер кэша) и платформенные каналы, а проверяется push, а не
/// каркас; вместо splash/login сессия задана готовой. Push идёт без Firebase —
/// [FakePushService]: на стенде `MockPushSender` (`notifications.module.ts`,
/// Firebase исключён 27.09.2026), внешние креды не нужны.
///
/// Уборка — внутри тела теста (`pushScreenTest`), как в `profile_page_test.dart`:
/// `closeDatabase` в `addTearDown` не завершается, потому что к этому моменту
/// очередь fake-async зоны больше не дренится (грабли М6.7,
/// `test/helpers/screen_harness.dart`).
void main() {
  // ------------------------------------------------------ словарь §3.4

  group('словарь push (§3.4)', () {
    test('data.type определяет маршрут', () {
      expect(pushRoute(const PushMessage(data: <String, String>{'type': 'EMERGENCY'})), '/today');
      expect(pushRoute(const PushMessage(data: <String, String>{'type': 'NEW_TICKET'})), '/today');
      expect(
        pushRoute(const PushMessage(data: <String, String>{'type': 'TICKET_OVERDUE'})),
        '/today',
      );
      expect(
        pushRoute(const PushMessage(data: <String, String>{'type': 'SCHEDULE_MISSED'})),
        '/today',
      );
      expect(pushRoute(const PushMessage(data: <String, String>{'type': 'MATERIAL_LOW'})), '/today');
      expect(
        pushRoute(const PushMessage(data: <String, String>{'type': 'GEOFENCE_EXIT'})),
        '/profile',
      );
      expect(
        pushRoute(
          const PushMessage(data: <String, String>{'type': 'CHAT_MESSAGE', 'chatId': 'chat-7'}),
        ),
        '/chats/chat-7',
      );
    });

    test('CHAT_MESSAGE без chatId и незнакомый тип никуда не ведут', () {
      expect(pushRoute(const PushMessage(data: <String, String>{'type': 'CHAT_MESSAGE'})), isNull);
      expect(
        pushRoute(const PushMessage(data: <String, String>{'type': 'CHAT_MESSAGE', 'chatId': ''})),
        isNull,
      );
      expect(pushRoute(const PushMessage(data: <String, String>{'type': 'UNKNOWN'})), isNull);
      expect(pushRoute(const PushMessage()), isNull);
    });

    test('PushMessage переносит заголовок, текст и строковый data', () {
      const PushMessage message = PushMessage(
        title: 'Аварийная заявка',
        body: 'БЦ «Север», санузел 101',
        data: <String, String>{'type': 'EMERGENCY', 'ticketId': 't-1'},
      );
      expect(message.type, 'EMERGENCY');
      expect(message.chatId, isNull);
      expect(message.data['ticketId'], 't-1');
      expect(message.title, 'Аварийная заявка');
    });

    test('платформа устройства для POST /device', () {
      // Тест идёт на хосте: платформа неизвестна, приложение считает себя
      // Android-сборкой (`devicePlatform`), иначе сервер ответил бы 400
      // «Недопустимая платформа».
      expect(devicePlatform(), Platform.isIOS ? 'ios' : 'android');
    });
  });

  // ------------------------------------ PushListener поверх настоящего роутера

  group('PushListener: регистрация устройства и переходы', () {
    testWidgets('сессия есть → токен устройства уходит в POST /device с платформой', (
      WidgetTester tester,
    ) async {
      await pushScreenTest(tester, body: (PushHarness harness) async {
        await harness.pumpApp();

        expect(harness.push.tokenCalls, greaterThanOrEqualTo(1));
        final List<Map<String, String>> sent = harness.notifications.registeredDevices;
        expect(sent, hasLength(1));
        expect(sent.single['token'], 'fcm-token-1');
        expect(sent.single['platform'], devicePlatform());

        // Регистрация идемпотентна: следующие кадры не шлют токен второй раз.
        await harness.settle();
        expect(harness.notifications.registeredDevices, hasLength(1));
      });
    });

    testWidgets('токена нет (Firebase не поднята) → устройство не регистрируем', (
      WidgetTester tester,
    ) async {
      await pushScreenTest(
        tester,
        deviceToken: null,
        body: (PushHarness harness) async {
          await harness.pumpApp();

          expect(harness.push.tokenCalls, greaterThanOrEqualTo(1));
          expect(harness.notifications.registeredDevices, isEmpty);
          expect(tester.takeException(), isNull);
        },
      );
    });

    testWidgets('отказ POST /device не ломает приложение и не всплывает ошибкой', (
      WidgetTester tester,
    ) async {
      await pushScreenTest(
        tester,
        deviceFailure: const ServerFailure('Нет соединения'),
        body: (PushHarness harness) async {
          await harness.pumpApp();

          // Попытка была, ошибка проглочена (`PushListener._registerToken`):
          // токен зарегистрируется при следующем входе.
          expect(harness.notifications.registeredDevices, hasLength(1));
          expect(tester.takeException(), isNull);

          // Экран остался рабочим: уведомление по-прежнему уводит на `/profile`.
          harness.push.emitForeground(
            const PushMessage(data: <String, String>{'type': 'GEOFENCE_EXIT'}),
          );
          await harness.settle();
          expect(harness.location, AppRoutes.profile);
        },
      );
    });

    testWidgets('CHAT_MESSAGE ведёт в переписку: /chats/{chatId}', (WidgetTester tester) async {
      await pushScreenTest(tester, body: (PushHarness harness) async {
        await harness.pumpApp();
        expect(harness.location, AppRoutes.today);

        harness.push.emitForeground(
          const PushMessage(
            title: 'Новое сообщение',
            data: <String, String>{'type': 'CHAT_MESSAGE', 'chatId': 'chat-42'},
          ),
        );
        await harness.settle();

        expect(harness.location, '/chats/chat-42');
        expect(find.byKey(const Key('chat_thread_chat-42')), findsOneWidget);
      });
    });

    testWidgets('GEOFENCE_EXIT и уведомление об открытии приложения ведут по словарю', (
      WidgetTester tester,
    ) async {
      await pushScreenTest(tester, body: (PushHarness harness) async {
        await harness.pumpApp();

        // Уведомление при открытом приложении (`onMessage`).
        harness.push.emitForeground(
          const PushMessage(data: <String, String>{'type': 'GEOFENCE_EXIT'}),
        );
        await harness.settle();
        expect(harness.location, AppRoutes.profile);
        // Экран профиля — настоящий (`profile.md` §6), а не заглушка.
        expect(find.byKey(const Key('profile_page')), findsOneWidget);

        // Уведомление, открывшее приложение (`onMessageOpenedApp`), — тот же словарь.
        harness.push.emitOpened(const PushMessage(data: <String, String>{'type': 'EMERGENCY'}));
        await harness.settle();
        expect(harness.location, AppRoutes.today);
      });
    });

    testWidgets('уведомление из запуска приложения сразу переводит по типу', (
      WidgetTester tester,
    ) async {
      await pushScreenTest(
        tester,
        initial: const PushMessage(data: <String, String>{'type': 'GEOFENCE_EXIT'}),
        body: (PushHarness harness) async {
          await harness.pumpApp();

          expect(harness.location, AppRoutes.profile);
        },
      );
    });

    testWidgets('незнакомый тип уведомления не меняет экран', (WidgetTester tester) async {
      await pushScreenTest(tester, body: (PushHarness harness) async {
        await harness.pumpApp();

        harness.push.emitForeground(
          const PushMessage(data: <String, String>{'type': 'SOMETHING_NEW'}),
        );
        await harness.settle();

        expect(harness.location, AppRoutes.today);
      });
    });
  });

  // ------------------------------------ инверсия disabledTypes (§3.4, §10.2)

  group('настройки уведомлений: инверсия disabledTypes', () {
    test('тумблер включён ⇄ тип ВЫЧЕРКНУТ из disabledTypes', () {
      const NotificationSettings settings = NotificationSettings(
        disabledTypes: <String>['MATERIAL_LOW', 'GEOFENCE_EXIT'],
        availableTypes: <String>['EMERGENCY', 'NEW_TICKET', 'MATERIAL_LOW', 'GEOFENCE_EXIT'],
      );

      // Чтение: выключенный тумблер — это тип в `disabledTypes`.
      expect(settings.isEnabled('MATERIAL_LOW'), isFalse);
      expect(settings.isEnabled('EMERGENCY'), isTrue);

      // Запись в обе стороны: включение вычёркивает, выключение добавляет.
      final NotificationSettings enabled = settings.withEnabled('MATERIAL_LOW', true);
      expect(enabled.disabledTypes, isNot(contains('MATERIAL_LOW')));
      expect(enabled.disabledTypes, contains('GEOFENCE_EXIT'));

      final NotificationSettings disabled = settings.withEnabled('EMERGENCY', false);
      expect(disabled.disabledTypes, contains('EMERGENCY'));
      expect(disabled.disabledTypes, contains('MATERIAL_LOW'));

      // Уже включённый тип не попадает в отказы, повторный отказ не дублируется.
      expect(settings.withEnabled('EMERGENCY', true).disabledTypes, settings.disabledTypes);
      expect(settings.withEnabled('MATERIAL_LOW', false).disabledTypes, settings.disabledTypes);
    });

    test('счётчик и подпись считают ВКЛЮЧЁННЫЕ типы, а не disabledTypes', () {
      const NotificationSettings settings = NotificationSettings(
        disabledTypes: <String>['MATERIAL_LOW', 'GEOFENCE_EXIT'],
        availableTypes: <String>['EMERGENCY', 'NEW_TICKET', 'MATERIAL_LOW', 'GEOFENCE_EXIT'],
      );
      expect(settings.enabledCount, 2);
      expect(settings.label, 'Включены (2 из 4)');
    });

    test('пустой disabledTypes — включено всё', () {
      const NotificationSettings settings = NotificationSettings(
        disabledTypes: <String>[],
        availableTypes: <String>['EMERGENCY', 'NEW_TICKET'],
      );
      expect(settings.enabledCount, 2);
      expect(settings.label, 'Включены (2 из 2)');
    });
  });
}

/// Стенд push-теста: настоящие `PushListener` и `GoRouter`, подмены сети и push.
class PushHarness {
  PushHarness._({
    required this.database,
    required this.container,
    required this.push,
    required this.notifications,
  });

  final AppDatabase database;
  final ProviderContainer container;
  final FakePushService push;
  final FakeNotificationsRepository notifications;

  /// Текущий адрес роутера приложения.
  String get location => container.read(appRouterProvider).state!.matchedLocation;

  /// Поднять `PushListener` над роутером и дать ему первый кадр.
  Future<void> pumpApp() async {
    // routerConfig берётся до pumpWidget: `PushListener` читает роутер из
    // контейнера, а `MaterialApp.router` только рисует его.
    final GoRouter router = container.read(appRouterProvider);
    await _tester!.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: router,
          builder: (BuildContext context, Widget? child) =>
              PushListener(child: child ?? const SizedBox.shrink()),
        ),
      ),
    );
    await settle();
  }

  /// Ограниченное число кадров вместо `pumpAndSettle`: на экране профиля живут
  /// индикаторы загрузки, и «полной остановки кадров» может не наступить
  /// никогда (грабли М6.7).
  Future<void> settle({int frames = 10}) async {
    for (int i = 0; i < frames; i++) {
      await _tester!.pump(const Duration(milliseconds: 50));
    }
  }

  WidgetTester? _tester;
}

/// Widget-тест push: поднимает [PushHarness] и **в теле теста** снимает дерево и
/// закрывает базу (`closeDatabase` в `addTearDown` не завершается: очередь
/// fake-async зоны к тому моменту уже не дренится — грабли М6.7).
Future<void> pushScreenTest(
  WidgetTester tester, {
  required Future<void> Function(PushHarness harness) body,
  String? deviceToken = 'fcm-token-1',
  Failure? deviceFailure,
  PushMessage? initial,
  ProviderContainer Function(AppDatabase database)? containerFactory,
}) async {
  final AppDatabase database = AppDatabase.memory();
  final FakePushService push = FakePushService(deviceToken: deviceToken)..initial = initial;
  final FakeNotificationsRepository notifications =
      FakeNotificationsRepository(deviceFailure: deviceFailure);
  final ProviderContainer container = (containerFactory ?? pushHarnessContainer)(
    database: database,
    notifications: notifications,
    push: push,
  );
  final PushHarness harness = PushHarness._(
    database: database,
    container: container,
    push: push,
    notifications: notifications,
  ).._tester = tester;

  try {
    await body(harness);
  } finally {
    await disposeScreen(tester);
    container.dispose();
    await closeDatabase(database);
    await push.dispose();
  }
}

/// Контейнер с готовой сессией, роутером приложения и подменами push.
ProviderContainer pushHarnessContainer({
  required AppDatabase database,
  required FakeNotificationsRepository notifications,
  required FakePushService push,
}) {
  final InMemorySecureStorage storage = InMemorySecureStorage()
    ..values[StorageKeys.accessToken] = 'access-token'
    ..values[StorageKeys.refreshToken] = 'refresh-token'
    ..values[StorageKeys.userId] = 'me'
    ..values[StorageKeys.role] = 'OPERATOR';
  return ProviderContainer(
    overrides: <Override>[
      secureStorageProvider.overrideWithValue(storage),
      appDatabaseProvider.overrideWithValue(database),
      pendingActionQueueProvider.overrideWithValue(InMemoryPendingActionQueue()),
      locationServiceProvider.overrideWithValue(FakeLocationService()),
      connectivityServiceProvider.overrideWithValue(FakeConnectivityService()),
      authRemoteDataSourceProvider.overrideWithValue(FakeAuthRemote()),
      notificationsRepositoryProvider.overrideWithValue(notifications),
      pushServiceProvider.overrideWithValue(push),
      // Сессия установлена: `PushListener` регистрирует токен для `userId`.
      sessionProvider.overrideWith(() => _SignedInSession()),
      appRouterProvider.overrideWith((Ref ref) => pushHarnessRouter()),
    ],
  );
}

/// Маршруты приложения, нужные push-словарю. `splash`/`login` не нужны: сессия
/// в тесте уже установлена, а переходы проверяются по адресу роутера.
/// `/profile` отдаёт **настоящий** `ProfilePage` (§6) — так проверяется, что
/// `GEOFENCE_EXIT` ведёт на существующий экран, а не на заглушку.
GoRouter pushHarnessRouter() {
  return GoRouter(
    initialLocation: AppRoutes.today,
    routes: <RouteBase>[
      ShellRoute(
        builder: (BuildContext context, GoRouterState state, Widget child) =>
            Scaffold(body: child),
        routes: <RouteBase>[
          GoRoute(path: AppRoutes.today, builder: (_, __) => const _StubPage('today_page')),
          GoRoute(
            path: AppRoutes.chats,
            builder: (_, __) => const _StubPage('chats_page'),
            routes: <RouteBase>[
              GoRoute(
                path: ':chatId',
                builder: (BuildContext context, GoRouterState state) =>
                    _StubPage('chat_thread_${state.pathParameters['chatId']}'),
              ),
            ],
          ),
          GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfilePage()),
        ],
      ),
    ],
  );
}

/// Сессия уже установлена: `PushListener` должен регистрировать токен.
class _SignedInSession extends SessionController {
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.authenticated, userId: 'me', role: 'OPERATOR');
}

/// Страница-метка: проверяется адрес, а не содержимое экрана.
class _StubPage extends StatelessWidget {
  const _StubPage(this.stubKey);

  final String stubKey;

  @override
  Widget build(BuildContext context) => Scaffold(
        key: Key(stubKey),
        body: Center(child: Text(stubKey)),
      );
}
