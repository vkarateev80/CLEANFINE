import 'dart:async';

import 'package:cleaning_ops_app/database/app_cache.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/auth/data/models/auth_user.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/auth_controller.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/auth_providers.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/features/home/presentation/providers/today_providers.dart';
import 'package:cleaning_ops_app/features/profile/presentation/providers/profile_providers.dart';
import 'package:cleaning_ops_app/services/api_client.dart';
import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/profile_fakes.dart';

/// Смена пользователя на одном устройстве (баги 08.10, симулятор iOS):
///
/// 1. оператор с открытой сменой выходит, входит админ — «Сегодня» и профиль
///    показывали данные оператора до pull-to-refresh;
/// 2. после выхода и входа другого пользователя фоновый refresh прежней сессии
///    мог вернуть её токены в хранилище.
///
/// Сеть — in-memory «стенд» auth/schedule/tickets/notifications с настоящей
/// ротацией и отзывом refresh-токенов; путь `ApiClient` → `SessionBridge` →
/// `SessionController` — рабочий, без подмен.
void main() {
  late _Stand stand;
  late InMemorySecureStorage storage;
  late AppDatabase database;
  late ProviderContainer container;

  setUp(() {
    stand = _Stand();
    storage = InMemorySecureStorage();
    database = AppDatabase.memory();
    final FakeHttpAdapter adapter = FakeHttpAdapter(stand.handle);
    Dio dioFor(String baseUrl) => Dio(
          BaseOptions(
            baseUrl: baseUrl,
            validateStatus: (int? status) => status != null && status < 500,
          ),
        )..httpClientAdapter = adapter;

    container = ProviderContainer(
      overrides: <Override>[
        secureStorageProvider.overrideWithValue(storage),
        pinCredentialsProvider.overrideWithValue(InMemoryPinStore()),
        appDatabaseProvider.overrideWithValue(database),
        pushServiceProvider.overrideWithValue(FakePushService(deviceToken: 'cf-device')),
        sessionRefreshDioProvider.overrideWithValue(dioFor('http://auth.test')),
        apiClientProvider.overrideWith(
          (Ref ref, String baseUrl) => ApiClient(
            baseUrl: baseUrl,
            tokenStore: ref.watch(secureStorageProvider),
            sessionBridge: ref.watch(sessionBridgeProvider),
            dio: dioFor(baseUrl),
          ),
        ),
      ],
    );
    // Как `CleaningOpsApp.initState`: 401 → refresh сессии, иначе выход.
    final SessionController session = container.read(sessionProvider.notifier);
    final SessionBridge bridge = container.read(sessionBridgeProvider);
    bridge.onRefresh = session.refreshTokens;
    bridge.onLogout = session.signOut;
  });

  tearDown(() async {
    container.dispose();
    await database.close();
  });

  Future<void> login(String email) async {
    final bool ok = await container
        .read(authControllerProvider.notifier)
        .login(email: email, password: _Stand.passwords[email]!);
    expect(ok, isTrue, reason: 'вход $email');
  }

  Future<void> logout() => container.read(logoutControllerProvider.notifier).logout();

  /// Экраны держат провайдеры подписанными — как и здесь.
  void watchScreens() {
    container.listen(todayOverviewProvider, (_, __) {});
    container.listen(profileProvider, (_, __) {});
  }

  group('данные прежнего пользователя не видны после перелогина', () {
    test('оператор с открытой сменой → «Выйти» → админ: ни смены, ни заявок, ни профиля оператора',
        () async {
      watchScreens();
      await login('operator');

      final TodayOverview operatorDay = await container.read(todayOverviewProvider.future);
      expect(operatorDay.current?.status, 'CHECKED_IN');
      expect(operatorDay.tickets.map((t) => t.id), <String>['t-op']);
      expect((await container.read(profileProvider.future)).role, 'OPERATOR');
      expect(await database.allShiftEvents(), isNotEmpty);

      await logout();

      // Выход стёр сессию, кэш на устройстве и отвязал push-токен.
      expect(await storage.readAccessToken(), isNull);
      expect(await storage.readRefreshToken(), isNull);
      expect(await database.cachedRowsCount(), 0);
      expect(stand.unregisteredDevices, <String>['u-op:cf-device']);
      expect(stand.activeSessions('u-op'), 0);

      await login('admin');

      final TodayOverview adminDay = await container.read(todayOverviewProvider.future);
      expect(adminDay.events, isEmpty);
      expect(adminDay.current, isNull);
      expect(adminDay.tickets, isEmpty);
      final AuthUser profile = await container.read(profileProvider.future);
      expect(profile.id, 'u-admin');
      expect(profile.role, 'ADMIN');
      expect(await database.allShiftEvents(), isEmpty);
    });

    test('вынужденный выход оставляет кэш оператору, но вход другого его стирает до чтения',
        () async {
      watchScreens();
      await login('operator');
      await container.read(todayOverviewProvider.future);
      expect(await database.allShiftEvents(), isNotEmpty);

      // Refresh не удался (`SessionBridge.logout`): данные не трогаются —
      // вернувшийся оператор не потеряет очередь.
      await container.read(sessionBridgeProvider).logout();
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
      expect(await database.allShiftEvents(), isNotEmpty);

      // Входит админ, а его смены сервер не отдаёт (нет сети и т. п.):
      // экран не имеет права показать смену оператора из кэша.
      stand.scheduleDown.add('u-admin');
      await login('admin');

      expect(await database.allShiftEvents(), isEmpty);
      await expectLater(container.read(todayOverviewProvider.future), throwsA(anything));
      final AsyncValue<TodayOverview> today = container.read(todayOverviewProvider);
      expect(today.valueOrNull?.events ?? const <ScheduleEvent>[], isEmpty);
    });
  });

  group('refresh после выхода не восстанавливает прежнего пользователя', () {
    test('refresh, начатый админом, завершился после входа бригадира — пара админа отозвана',
        () async {
      watchScreens();
      await login('admin');
      stand.expireAccessOf('u-admin');

      // Фоновый запрос админа получает 401 и уходит в refresh; ответ refresh
      // задерживается сервером (ротация уже произошла).
      final Completer<void> release = Completer<void>();
      stand.holdNextRefresh = release.future;
      final Future<Result<List<ScheduleEvent>>> backgroundCall =
          container.read(scheduleRepositoryProvider).myEvents();
      await _until(() => stand.heldRefreshes == 1);

      await logout();
      await login('supervisor@cleaning-ops.com');
      release.complete();

      final Result<List<ScheduleEvent>> result = await backgroundCall;
      expect(result.isSuccess, isFalse, reason: 'запрос админа не повторяется под бригадиром');

      // Сессия и токены — бригадира; админская пара из позднего refresh отозвана.
      final SessionState session = container.read(sessionProvider);
      expect(session.isAuthenticated, isTrue);
      expect(session.userId, 'u-super');
      expect(stand.userOfAccess(await storage.readAccessToken()), 'u-super');
      expect(stand.userOfRefresh(await storage.readRefreshToken()), 'u-super');
      await _until(() => stand.activeSessions('u-admin') == 0);
      expect(stand.activeSessions('u-admin'), 0);

      final AuthUser profile = await container.read(profileProvider.future);
      expect(profile.role, 'SUPERVISOR');
    });

    test('401 на запрос прежней сессии не запускает refresh и не выкидывает нового пользователя',
        () async {
      await login('admin');
      stand.expireAccessOf('u-admin');

      final Completer<void> release = Completer<void>();
      stand.holdSchedule = release.future;
      final Future<Result<List<ScheduleEvent>>> staleCall =
          container.read(scheduleRepositoryProvider).myEvents();
      await _until(() => stand.heldSchedules == 1);

      await logout();
      await login('supervisor@cleaning-ops.com');
      final int refreshesBefore = stand.refreshCalls;
      final int adminPairsBefore = stand.issuedPairs('u-admin');
      release.complete();

      expect((await staleCall).isSuccess, isFalse);
      expect(stand.refreshCalls, refreshesBefore);
      expect(stand.issuedPairs('u-admin'), adminPairsBefore);
      expect(container.read(sessionProvider).userId, 'u-super');
      expect(stand.userOfAccess(await storage.readAccessToken()), 'u-super');
    });

    test('выход с истёкшим access не оставляет на сервере живой сессии', () async {
      await login('admin');
      stand.expireAccessOf('u-admin');

      await logout();

      expect(stand.activeSessions('u-admin'), 0);
      expect(await storage.readAccessToken(), isNull);
      expect(await storage.readRefreshToken(), isNull);
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
    });

    test('refresh с ответом 201 (как у auth-service) продлевает сессию, а не выкидывает', () async {
      await login('operator');
      final String? before = await storage.readAccessToken();
      stand.expireAccessOf('u-op');

      final Result<List<ScheduleEvent>> result =
          await container.read(scheduleRepositoryProvider).myEvents();

      expect(result.dataOrNull?.single.status, 'CHECKED_IN');
      expect(container.read(sessionProvider).userId, 'u-op');
      final String? after = await storage.readAccessToken();
      expect(after, isNot(before));
      expect(stand.userOfAccess(after), 'u-op');
    });
  });
}

/// Ждать условия, прокручивая очередь событий (стенд отвечает асинхронно).
Future<void> _until(bool Function() condition) async {
  for (int i = 0; i < 500 && !condition(); i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

/// In-memory стенд: auth-service (ротация и отзыв refresh, 201 на refresh,
/// logout только с живым access), смены, заявки и устройства push.
class _Stand {
  static const Map<String, String> passwords = <String, String>{
    'operator': 'oper123',
    'admin': 'admin123',
    'supervisor@cleaning-ops.com': 'super123',
  };

  static const Map<String, Map<String, Object>> _users = <String, Map<String, Object>>{
    'operator': <String, Object>{'id': 'u-op', 'fullName': 'Оператор', 'role': 'OPERATOR'},
    'admin': <String, Object>{'id': 'u-admin', 'fullName': 'Администратор', 'role': 'ADMIN'},
    'supervisor@cleaning-ops.com': <String, Object>{
      'id': 'u-super',
      'fullName': 'Бригадир',
      'role': 'SUPERVISOR',
    },
  };

  int _seq = 0;
  final Map<String, String> _access = <String, String>{};
  final Set<String> _expired = <String>{};
  final Map<String, String> _refresh = <String, String>{};
  final Set<String> _revoked = <String>{};
  final Map<String, int> _issued = <String, int>{};

  final List<String> unregisteredDevices = <String>[];
  final Set<String> scheduleDown = <String>{};
  int refreshCalls = 0;

  Future<void>? holdNextRefresh;
  int heldRefreshes = 0;
  Future<void>? holdSchedule;
  int heldSchedules = 0;

  String? userOfAccess(String? token) => token == null ? null : _access[token];

  String? userOfRefresh(String? token) => token == null ? null : _refresh[token];

  int activeSessions(String userId) => _refresh.entries
      .where((MapEntry<String, String> e) => e.value == userId && !_revoked.contains(e.key))
      .length;

  int issuedPairs(String userId) => _issued[userId] ?? 0;

  void expireAccessOf(String userId) {
    _access.forEach((String token, String owner) {
      if (owner == userId) _expired.add(token);
    });
  }

  Map<String, Object> _issue(String userId) {
    _seq++;
    final String access = 'acc-$userId-$_seq';
    final String refresh = 'ref-$userId-$_seq';
    _access[access] = userId;
    _refresh[refresh] = userId;
    _issued[userId] = issuedPairs(userId) + 1;
    return <String, Object>{'accessToken': access, 'refreshToken': refresh};
  }

  String? _bearerUser(RequestOptions options) {
    final Object? header = options.headers['Authorization'];
    if (header is! String || !header.startsWith('Bearer ')) return null;
    final String token = header.substring(7);
    if (_expired.contains(token)) return null;
    return _access[token];
  }

  Map<String, Object> _userJson(String userId) {
    final MapEntry<String, Map<String, Object>> entry =
        _users.entries.firstWhere((e) => e.value['id'] == userId);
    return <String, Object>{...entry.value, 'email': entry.key, 'isActive': true};
  }

  static const FakeResponse _unauthorized =
      FakeResponse(401, <String, Object>{'message': 'Unauthorized'});

  Future<FakeResponse> handle(RequestOptions options) async {
    final String path = options.path;
    final Map<dynamic, dynamic> body =
        options.data is Map ? options.data as Map<dynamic, dynamic> : const <dynamic, dynamic>{};

    if (path == '/api/auth/login') {
      final String email = body['email'].toString();
      if (passwords[email] != body['password']) return _unauthorized;
      return FakeResponse(201, _issue(_users[email]!['id']! as String));
    }
    if (path == '/api/auth/refresh') {
      refreshCalls++;
      final String token = body['refreshToken'].toString();
      final String? userId = _refresh[token];
      if (userId == null || _revoked.contains(token)) return _unauthorized;
      _revoked.add(token);
      final Map<String, Object> pair = _issue(userId);
      final Future<void>? hold = holdNextRefresh;
      if (hold != null) {
        holdNextRefresh = null;
        heldRefreshes++;
        await hold;
      }
      return FakeResponse(201, pair);
    }

    final String? userId = _bearerUser(options);

    if (path == '/api/auth/logout') {
      if (userId == null) return _unauthorized;
      final Object? token = body['refreshToken'];
      if (token != null) {
        _revoked.add(token.toString());
      } else {
        _revoked.addAll(_refresh.keys.where((String t) => _refresh[t] == userId));
      }
      return const FakeResponse(204, <String, Object>{});
    }
    if (path == '/api/auth/me') {
      return userId == null ? _unauthorized : FakeResponse(200, _userJson(userId));
    }
    if (path == '/api/schedule/my') {
      final Future<void>? hold = holdSchedule;
      if (hold != null) {
        holdSchedule = null;
        heldSchedules++;
        await hold;
      }
      if (userId == null) return _unauthorized;
      if (scheduleDown.contains(userId)) {
        return const FakeResponse(503, <String, Object>{'message': 'Сервис недоступен'});
      }
      return FakeResponse(200, <Object>[
        if (userId == 'u-op')
          <String, Object>{
            'id': 'ev-op',
            'scheduleId': 'sch-op',
            'scheduleName': 'Ежедневный обход ЗИЛ — утро',
            'date': '2026-10-08',
            'plannedStart': '2026-10-08T08:00:00.000Z',
            'status': 'CHECKED_IN',
          },
      ]);
    }
    if (path == '/api/tickets') {
      if (userId == null) return _unauthorized;
      return FakeResponse(200, <String, Object>{
        'items': <Object>[
          if (userId == 'u-op' && options.queryParameters['assigneeId'] == 'u-op')
            <String, Object>{
              'id': 't-op',
              'status': 'new',
              'type': 'planned',
              'priority': 'normal',
              'description': 'Заявка оператора',
            },
        ],
      });
    }
    if (path.startsWith('/api/notifications/device')) {
      if (userId == null) return _unauthorized;
      if (options.method == 'DELETE') {
        unregisteredDevices.add('$userId:${Uri.decodeComponent(path.split('/').last)}');
      }
      return const FakeResponse(200, <String, Object>{});
    }
    return const FakeResponse(404, <String, Object>{'message': 'Не найдено'});
  }
}
