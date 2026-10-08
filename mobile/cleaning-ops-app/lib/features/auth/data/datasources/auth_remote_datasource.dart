import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../services/api_client.dart';
import '../models/auth_tokens.dart';
import '../models/auth_user.dart';

/// HTTP-вызовы auth-service (`backend/auth-service/src/auth/auth.controller.ts`).
///
/// Слой ничего не решает про UI: он только ходит в сеть и разбирает тела ответов.
/// Ошибки не глушит — их переводит в `Failure` репозиторий
/// (`auth_repository.dart`). Тела запросов — ровно те DTO, что описаны в
/// `design/screens/mobile/auth.md` §9.
class AuthRemoteDataSource {
  AuthRemoteDataSource(this._api);

  static const String _loginPath = '${ApiConstants.apiPrefix}/auth/login';
  static const String _pinPath = '${ApiConstants.apiPrefix}/auth/pin';
  static const String _biometricPath = '${ApiConstants.apiPrefix}/auth/biometric';
  static const String _refreshPath = '${ApiConstants.apiPrefix}/auth/refresh';
  static const String _logoutPath = '${ApiConstants.apiPrefix}/auth/logout';
  static const String _mePath = '${ApiConstants.apiPrefix}/auth/me';
  static const String _changePinPath = '${ApiConstants.apiPrefix}/auth/change-pin';
  static const String _changePasswordPath = '${ApiConstants.apiPrefix}/auth/change-password';

  final ApiClient _api;

  /// `POST /api/auth/login {email, password}` → 201 `{accessToken, refreshToken}`.
  Future<AuthTokens> login({required String email, required String password}) async {
    final response = await _api.post(
      _loginPath,
      data: <String, dynamic>{'email': email, 'password': password},
    );
    return _tokensOf(response.data);
  }

  /// `POST /api/auth/pin {email | phone, pinCode}` → 201 пара токенов.
  ///
  /// `AuthService.pinLogin` ищет пользователя по `OR: [{email}, {phone}]` и
  /// бросает 401 «Укажите email или телефон», если не передано ни то, ни другое.
  Future<AuthTokens> loginWithPin({
    String? email,
    String? phone,
    required String pinCode,
  }) async {
    final response = await _api.post(
      _pinPath,
      data: <String, dynamic>{
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        'pinCode': pinCode,
      },
    );
    return _tokensOf(response.data);
  }

  /// `POST /api/auth/biometric {biometricKey}` → 201 пара токенов.
  ///
  /// Работает только если `User.biometricKey` уже записан на сервере; эндпоинта
  /// записи ключа в API нет (`auth.md` п. 10.1).
  Future<AuthTokens> loginWithBiometric({required String biometricKey}) async {
    final response = await _api.post(
      _biometricPath,
      data: <String, dynamic>{'biometricKey': biometricKey},
    );
    return _tokensOf(response.data);
  }

  /// `POST /api/auth/refresh {refreshToken}` → 201 новая пара.
  ///
  /// [detached] — обновление вне текущей сессии (отзыв пары при выходе):
  /// запрос не берёт токен из хранилища и не запускает refresh интерцептора.
  Future<AuthTokens> refresh({required String refreshToken, bool detached = false}) async {
    final response = await _api.post(
      _refreshPath,
      data: <String, dynamic>{'refreshToken': refreshToken},
      options: detached ? ApiClient.explicitAuth(null) : null,
    );
    return _tokensOf(response.data);
  }

  /// `POST /api/auth/logout {refreshToken}` → 204.
  ///
  /// Без `refreshToken` сервер отзывает все сессии пользователя; поле
  /// необязательно (`RefreshTokenDto`), но требует access-токена.
  ///
  /// [accessToken] — выход от имени уже снятой локально сессии: заголовок
  /// ставится явно, 401 не превращается в refresh (иначе интерцептор выпустил
  /// бы новую пару, которую никто не отзовёт).
  Future<void> logout({String? refreshToken, String? accessToken}) async {
    await _api.post(
      _logoutPath,
      data: <String, dynamic>{
        if (refreshToken != null && refreshToken.isNotEmpty) 'refreshToken': refreshToken,
      },
      options: accessToken != null ? ApiClient.explicitAuth(accessToken) : null,
    );
  }

  /// `GET /api/auth/me` → 200 `SafeUser`.
  Future<AuthUser> me() async {
    final response = await _api.get(_mePath);
    final user = AuthUser.tryParse(response.data);
    if (user == null) {
      throw const ServerException('Сервер вернул некорректный профиль');
    }
    return user;
  }

  /// `POST /api/auth/change-pin {currentPassword, newPin}` → 201.
  Future<void> changePin({required String currentPassword, required String newPin}) async {
    await _api.post(
      _changePinPath,
      data: <String, dynamic>{'currentPassword': currentPassword, 'newPin': newPin},
    );
  }

  /// `POST /api/auth/change-password {currentPassword, newPassword}` → 201,
  /// сервер отзывает **все** сессии пользователя.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.post(
      _changePasswordPath,
      data: <String, dynamic>{
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  /// Разбор `TokenPairDto`; пустое/чужое тело — ошибка сервера, не «успех».
  static AuthTokens _tokensOf(dynamic body) {
    final tokens = AuthTokens.tryParse(body);
    if (tokens == null) {
      throw const ServerException('Сервер не вернул пару токенов');
    }
    return tokens;
  }
}
