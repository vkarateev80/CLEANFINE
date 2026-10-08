import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../services/api_client.dart';
import '../../../../services/secure_storage_service.dart';
import '../../../../services/service_providers.dart';
import '../../../../services/user_data_cleaner.dart';
import '../../data/repositories/auth_session_writer.dart';

/// Состояние сессии: приложение стартует «в неизвестности», пока не прочитало
/// токены из защищённого хранилища.
enum SessionStatus { unknown, authenticated, unauthenticated }

class SessionState {
  const SessionState({required this.status, this.userId, this.role, this.fullName});

  const SessionState.unknown() : this(status: SessionStatus.unknown);
  const SessionState.unauthenticated() : this(status: SessionStatus.unauthenticated);

  final SessionStatus status;
  final String? userId;
  final String? role;
  final String? fullName;

  bool get isAuthenticated => status == SessionStatus.authenticated;
  bool get isUnknown => status == SessionStatus.unknown;
}

/// Единственный источник правды о том, вошёл ли пользователь, и владелец пары
/// токенов (хранение + обновление по refresh-токену).
///
/// Роутер слушает это состояние: `unknown` → splash, нет сессии → `/login`,
/// есть → `/home`. Фича авторизации вызывает [signIn] после успешного входа
/// (пароль, PIN или биометрия).
///
/// Реализует [AuthSessionWriter]: репозиторий авторизации закрепляет сессию
/// через этот контракт и не зависит от Riverpod.
class SessionController extends Notifier<SessionState> implements AuthSessionWriter {
  Dio get _refreshDio => ref.read(sessionRefreshDioProvider);

  @override
  SessionState build() => const SessionState.unknown();

  SecureStorageService get _storage => ref.read(secureStorageProvider);

  SessionBridge get _bridge => ref.read(sessionBridgeProvider);

  /// Хвост очереди операций с хранилищем токенов: вход, выход и запись пары
  /// после refresh не перемежаются (иначе refresh прежней сессии мог записать
  /// свои токены поверх только что очищенного хранилища).
  Future<void> _tail = Future<void>.value();

  Future<T> _serialized<T>(Future<T> Function() action) {
    final Future<T> result = _tail.then((_) => action());
    _tail = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }

  /// Чтение сохранённой сессии при запуске приложения.
  Future<void> bootstrap() async {
    try {
      final access = await _storage.readAccessToken();
      final refresh = await _storage.readRefreshToken();
      if (access == null || refresh == null || access.isEmpty || refresh.isEmpty) {
        state = const SessionState.unauthenticated();
        return;
      }
      final String? userId = await _storage.readUserId();
      state = SessionState(
        status: SessionStatus.authenticated,
        userId: userId,
        role: await _storage.readRole(),
      );
      // Установка поверх версии без владельца данных: кэш принадлежит
      // сохранённой сессии. Нужно лишь к следующему входу — запуск не ждёт.
      if (userId != null) unawaited(_adoptDataOwner(userId));
    } on Exception {
      state = const SessionState.unauthenticated();
    }
  }

  /// Сохранение сессии после успешного входа.
  ///
  /// Вошёл не тот, чьи данные лежат на устройстве, — они стираются до того,
  /// как экраны новой сессии прочитают кэш.
  @override
  Future<void> signIn({
    required String accessToken,
    required String refreshToken,
    String? userId,
    String? role,
    String? fullName,
  }) {
    return _serialized(() async {
      _bridge.startNewSession();
      await _storage.saveTokens(accessToken: accessToken, refreshToken: refreshToken);
      if (userId != null) await _storage.saveUserId(userId);
      if (role != null) await _storage.saveRole(role);
      if (userId != null) {
        final String? owner = await _readDataOwner();
        if (owner != null && owner != userId) await _clearUserData();
        if (owner != userId) await _saveDataOwner(userId);
      }
      state = SessionState(
        status: SessionStatus.authenticated,
        userId: userId,
        role: role,
        fullName: fullName,
      );
    });
  }

  /// Замена пары токенов (после refresh).
  Future<void> updateTokens({required String accessToken, required String refreshToken}) {
    return _serialized(
      () => _storage.saveTokens(accessToken: accessToken, refreshToken: refreshToken),
    );
  }

  /// То же, что [updateTokens], но под именем контракта [AuthSessionWriter]:
  /// репозиторий сохраняет токены, ещё не объявляя сессию установленной
  /// (сначала нужно проверить роль в `GET /api/auth/me`).
  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) {
    return updateTokens(accessToken: accessToken, refreshToken: refreshToken);
  }

  /// Обновление пары токенов по refresh-токену. Вызывается `SessionBridge`
  /// при 401. `false` — сессию восстановить нельзя, приложение уводит на вход.
  ///
  /// Сессия сменилась, пока запрос был в сети (выход, вход другого), — новая
  /// пара не записывается, а отзывается на сервере: прежний пользователь не
  /// «воскресает» поверх нового и не остаётся висящей сессией в БД.
  Future<bool> refreshTokens() async {
    final int epoch = _bridge.epoch;
    late final String? refresh;
    try {
      refresh = await _storage.readRefreshToken();
    } on Exception {
      return false;
    }
    if (refresh == null || refresh.isEmpty) return false;

    final String access;
    final String newRefresh;
    try {
      final response = await _refreshDio.post<dynamic>(
        '${ApiConstants.apiPrefix}/auth/refresh',
        data: <String, dynamic>{'refreshToken': refresh},
      );
      if (response.statusCode != 200 && response.statusCode != 201) return false;
      final data = response.data;
      if (data is! Map) return false;
      final String? accessValue = data['accessToken']?.toString();
      if (accessValue == null || accessValue.isEmpty) return false;
      access = accessValue;
      newRefresh = data['refreshToken']?.toString() ?? refresh;
    } on Exception {
      return false;
    }

    return _serialized(() async {
      if (_bridge.epoch != epoch) {
        unawaited(_revoke(accessToken: access, refreshToken: newRefresh));
        return false;
      }
      try {
        await _storage.saveTokens(accessToken: access, refreshToken: newRefresh);
      } on Exception {
        return false;
      }
      return true;
    });
  }

  /// Выход: локальная сессия чистится всегда, даже если серверный logout упал.
  ///
  /// [clearUserData] — явный выход пользователя (кнопка «Выйти»):
  /// стираются и данные на устройстве. Вынужденный выход (refresh не удался)
  /// их не трогает: тот же пользователь, войдя снова, не теряет очередь, а
  /// другой — получит чистое устройство по проверке владельца в [signIn].
  @override
  Future<void> signOut({bool clearUserData = false}) {
    return _serialized(() async {
      _bridge.startNewSession();
      try {
        await _storage.clearSession();
        if (clearUserData) await _clearUserData();
      } finally {
        state = const SessionState.unauthenticated();
      }
    });
  }

  /// Отзыв пары, которую никто уже не будет использовать. Best-effort.
  Future<void> _revoke({required String accessToken, required String refreshToken}) async {
    try {
      await _refreshDio.post<dynamic>(
        '${ApiConstants.apiPrefix}/auth/logout',
        data: <String, dynamic>{'refreshToken': refreshToken},
        options: Options(headers: <String, dynamic>{'Authorization': 'Bearer $accessToken'}),
      );
    } on Exception {
      // Нет сети — токен истечёт сам; в приложение он уже не попадёт.
    }
  }

  Future<void> _clearUserData() async {
    try {
      await ref.read(userDataCleanerProvider).clear();
    } on Object {
      // Сбой очистки не должен оставить пользователя «полувышедшим»: следующий
      // вход другого пользователя повторит её по владельцу данных.
    }
  }

  Future<void> _adoptDataOwner(String userId) async {
    if (await _readDataOwner() == null) await _saveDataOwner(userId);
  }

  Future<String?> _readDataOwner() async {
    try {
      return await _storage.readDataOwner();
    } on Exception {
      return null;
    }
  }

  Future<void> _saveDataOwner(String userId) async {
    try {
      await _storage.saveDataOwner(userId);
    } on Exception {
      // Без метки владельца следующий вход просто не узнает о смене пользователя;
      // кэш «на сегодня» всё равно заменяется ответом сети целиком.
    }
  }
}

/// «Голый» Dio для refresh: без интерцепторов `ApiClient`, иначе 401 при
/// обновлении токена уйдёт в тот же обработчик и зациклится. Провайдер — чтобы
/// тесты подменяли сеть.
final sessionRefreshDioProvider = Provider<Dio>((Ref ref) {
  return Dio(
    BaseOptions(
      baseUrl: ApiConstants.authBaseUrl,
      connectTimeout: ApiConstants.connectTimeout,
      receiveTimeout: ApiConstants.receiveTimeout,
      contentType: Headers.jsonContentType,
      validateStatus: (status) => status != null && status < 500,
    ),
  );
});

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// Чья сейчас сессия: `userId` вошедшего пользователя или `null` без входа.
///
/// Провайдеры с данными пользователя (смены, заявки, профиль, чаты, админ-доска,
/// фоновые сервисы) подписываются на него: при выходе и входе другого они
/// пересобираются с нуля, а не показывают прежнего пользователя до
/// pull-to-refresh.
final sessionScopeProvider = Provider<String?>((Ref ref) {
  return ref.watch(
    sessionProvider.select(
      (SessionState session) => session.isAuthenticated ? (session.userId ?? '') : null,
    ),
  );
});
