import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../services/secure_storage_service.dart';
import '../../../../services/service_providers.dart';
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
  /// «Голый» Dio для refresh: без интерцепторов `ApiClient`, иначе 401 при
  /// обновлении токена уйдёт в тот же обработчик и зациклится.
  final Dio _refreshDio = Dio(
    BaseOptions(
      baseUrl: ApiConstants.authBaseUrl,
      connectTimeout: ApiConstants.connectTimeout,
      receiveTimeout: ApiConstants.receiveTimeout,
      contentType: Headers.jsonContentType,
      validateStatus: (status) => status != null && status < 500,
    ),
  );

  @override
  SessionState build() => const SessionState.unknown();

  SecureStorageService get _storage => ref.read(secureStorageProvider);

  /// Чтение сохранённой сессии при запуске приложения.
  Future<void> bootstrap() async {
    try {
      final access = await _storage.readAccessToken();
      final refresh = await _storage.readRefreshToken();
      if (access == null || refresh == null || access.isEmpty || refresh.isEmpty) {
        state = const SessionState.unauthenticated();
        return;
      }
      state = SessionState(
        status: SessionStatus.authenticated,
        userId: await _storage.readUserId(),
        role: await _storage.readRole(),
      );
    } on Exception {
      state = const SessionState.unauthenticated();
    }
  }

  /// Сохранение сессии после успешного входа.
  @override
  Future<void> signIn({
    required String accessToken,
    required String refreshToken,
    String? userId,
    String? role,
    String? fullName,
  }) async {
    await _storage.saveTokens(accessToken: accessToken, refreshToken: refreshToken);
    if (userId != null) await _storage.saveUserId(userId);
    if (role != null) await _storage.saveRole(role);
    state = SessionState(
      status: SessionStatus.authenticated,
      userId: userId,
      role: role,
      fullName: fullName,
    );
  }

  /// Замена пары токенов (после refresh).
  Future<void> updateTokens({required String accessToken, required String refreshToken}) {
    return _storage.saveTokens(accessToken: accessToken, refreshToken: refreshToken);
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
  Future<bool> refreshTokens() async {
    late final String? refresh;
    try {
      refresh = await _storage.readRefreshToken();
    } on Exception {
      return false;
    }
    if (refresh == null || refresh.isEmpty) return false;

    try {
      final response = await _refreshDio.post<dynamic>(
        '${ApiConstants.apiPrefix}/auth/refresh',
        data: <String, dynamic>{'refreshToken': refresh},
      );
      if (response.statusCode != 200) return false;
      final data = response.data;
      if (data is! Map) return false;
      final access = data['accessToken']?.toString();
      if (access == null || access.isEmpty) return false;
      final newRefresh = data['refreshToken']?.toString() ?? refresh;
      await updateTokens(accessToken: access, refreshToken: newRefresh);
      return true;
    } on Exception {
      return false;
    }
  }

  /// Выход: локальная сессия чистится всегда, даже если серверный logout упал.
  @override
  Future<void> signOut() async {
    await _storage.clearSession();
    state = const SessionState.unauthenticated();
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);
