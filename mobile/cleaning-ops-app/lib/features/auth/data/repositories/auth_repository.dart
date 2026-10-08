import '../../../../core/app_product.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../core/errors/failures.dart';
import '../../../../services/secure_storage_service.dart';
import '../../auth_texts.dart';
import '../datasources/auth_remote_datasource.dart';
import '../datasources/pin_credentials_store.dart';
import '../models/auth_tokens.dart';
import '../models/auth_user.dart';
import 'auth_result.dart';
import 'auth_session_writer.dart';

/// Единственная точка входа в auth-service для UI.
///
/// Задачи репозитория:
/// 1. сходить в API (`AuthRemoteDataSource`);
/// 2. разобрать ответ в модели (`AuthTokens`, `AuthUser`);
/// 3. **не пускать исключения наружу** — `AppException` → `Failure`
///    (`_translate`);
/// 4. закрепить сессию: токены и роль — через `SessionController` (`signIn`),
///    биометрический ключ / email для PIN — в защищённое хранилище;
/// 5. не пустить в приложение роль `CLIENT` (`auth.md` §4.6): серверный `logout`
///    и полная очистка локальной сессии.
class AuthRepository {
  AuthRepository({
    required AuthRemoteDataSource remote,
    required SecureStorageService storage,
    required AuthSessionWriter session,
    required PinCredentialsStore pinStore,
    ProductConfig? product,
  })  : _remote = remote,
        _storage = storage,
        _session = session,
        _pinStore = pinStore,
        _product = product ?? ProductConfig.of(AppProduct.operator);

  final AuthRemoteDataSource _remote;
  final SecureStorageService _storage;
  final AuthSessionWriter _session;
  final PinCredentialsStore _pinStore;

  /// Продукт решает, какие роли сюда пускать (оператор ≠ команда).
  final ProductConfig _product;

  /// Вход по email и паролю: `POST /api/auth/login` → `GET /api/auth/me`.
  ///
  /// Email запоминается в `pin_email` — следующий вход возможен по PIN (§8).
  Future<AuthResult<AuthUser>> login({required String email, required String password}) {
    return _run(() async {
      final tokens = await _remote.login(email: email, password: password);
      return _establishSession(tokens, pinEmail: email);
    });
  }

  /// Вход по PIN: `POST /api/auth/pin {email | phone, pinCode}`.
  ///
  /// Email/телефон берутся из защищённого хранилища, если не переданы явно:
  /// сервер требует хотя бы одно из полей (`pin-login.dto.ts`).
  Future<AuthResult<AuthUser>> loginWithPin({
    required String pin,
    String? email,
    String? phone,
  }) {
    return _run(() async {
      final credentials = await _pinStore.read();
      final String? emailValue = _firstNonEmpty(<String?>[email, credentials.email]);
      final String? phoneValue = _firstNonEmpty(<String?>[phone, credentials.phone]);
      if (emailValue == null && phoneValue == null) {
        // На этом устройстве вход по паролю ещё не выполнялся: PIN не установлен.
        // Это не 401 сервера (его текст `ApiClient` не сохраняет), а известное
        // локальное состояние — показываем текст из `auth.md` §4.6.
        throw const NotFoundException(AuthTexts.pinNotSet);
      }
      final tokens = await _remote.loginWithPin(
        email: emailValue,
        phone: phoneValue,
        pinCode: pin,
      );
      return _establishSession(tokens, pinEmail: emailValue);
    });
  }

  /// Вход по отпечатку: `local_auth` уже подтвердил личность, здесь —
  /// `POST /api/auth/biometric {biometricKey}`.
  ///
  /// Ключ мог быть записан только сервером: в API нет эндпоинта его регистрации
  /// (`auth.md` п. 10.1), поэтому приложение ничего не выдумывает.
  Future<AuthResult<AuthUser>> loginWithBiometric() {
    return _run(() async {
      final String? key = await _storage.readBiometricKey();
      if (key == null || key.isEmpty) {
        throw const NotFoundException(AuthTexts.biometricKeyMissing);
      }
      final tokens = await _remote.loginWithBiometric(biometricKey: key);
      return _establishSession(tokens);
    });
  }

  /// `POST /api/auth/refresh` + обновление пары в хранилище.
  ///
  /// Штатное обновление при 401 делает `SessionBridge` → `SessionController`
  /// (`api_client.dart`); этот метод — для явного вызова из UI.
  Future<AuthResult<AuthTokens>> refresh(String refreshToken) {
    return _run(() async {
      final tokens = await _remote.refresh(refreshToken: refreshToken);
      await _session.saveTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      return tokens;
    });
  }

  /// Выход: локальная очистка + серверный отзыв сессии (`POST /api/auth/logout`).
  ///
  /// Ошибка сети не мешает выходу (`profile.md` п. 10.5): локальная сессия
  /// чистится в любом случае, поэтому результатом всегда успех.
  ///
  /// Порядок важен. Сначала пара токенов запоминается и сессия гасится локально
  /// (`signOut` сдвигает эпоху `SessionBridge`): фоновые запросы и refresh
  /// прежнего пользователя после этого ничего не запишут. Затем пара отзывается
  /// явно, мимо хранилища: access-токен мог истечь — тогда она сперва
  /// обновляется и отзывается уже новая, чтобы на сервере не осталось живой
  /// сессии, которую никто не держит.
  Future<AuthResult<bool>> logout() {
    return _run(() async {
      final String? accessToken = await _readOrNull(_storage.readAccessToken);
      final String? refreshToken = await _readOrNull(_storage.readRefreshToken);
      await _session.signOut(clearUserData: true);
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _revoke(accessToken: accessToken, refreshToken: refreshToken);
      }
      return true;
    });
  }

  Future<void> _revoke({String? accessToken, required String refreshToken}) async {
    try {
      await _remote.logout(refreshToken: refreshToken, accessToken: accessToken ?? '');
      return;
    } on UnauthorizedException {
      // Access истёк — ниже обновим пару и отзовём уже её.
    } on AppException {
      return; // Нет сети или токен уже отозван — выходим локально.
    }
    try {
      final AuthTokens fresh = await _remote.refresh(refreshToken: refreshToken, detached: true);
      await _remote.logout(refreshToken: fresh.refreshToken, accessToken: fresh.accessToken);
    } on AppException {
      // Refresh-токен уже мёртв — отзывать нечего.
    }
  }

  static Future<String?> _readOrNull(Future<String?> Function() read) async {
    try {
      return await read();
    } on AppException {
      return null;
    }
  }

  /// Установка/смена PIN: `POST /api/auth/change-pin {currentPassword, newPin}`.
  ///
  /// Сервер требует текущий пароль (`ChangePinDto`) и валидный access-токен,
  /// поэтому PIN ставится только из авторизованного состояния. После успеха
  /// сохраняется `pin_length` (для автоотправки) и email/телефон устройства.
  Future<AuthResult<bool>> changePin({
    required String currentPassword,
    required String newPin,
  }) {
    return _run(() async {
      await _remote.changePin(currentPassword: currentPassword, newPin: newPin);
      await _pinStore.saveLength(newPin.length);
      await _rememberPinIdentity();
      return true;
    });
  }

  /// Смена пароля: `POST /api/auth/change-password {currentPassword, newPassword}`.
  ///
  /// Сервер отзывает **все** сессии пользователя (204/201 в контроллере), поэтому
  /// локальная сессия тоже гасится — иначе приложение осталось бы с мёртвым
  /// refresh-токеном.
  Future<AuthResult<bool>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return _run(() async {
      await _remote.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      // Данные не стираются: войдёт тот же пользователь с новым паролем
      // (очередь не теряется), а вход другого их сотрёт по владельцу данных.
      await _session.signOut();
      return true;
    });
  }

  /// `GET /api/auth/me` — профиль текущего пользователя.
  Future<AuthResult<AuthUser>> me() => _run(_remote.me);

  /// Токены получены: сохраняем их, читаем профиль, проверяем роль и только
  /// тогда объявляем сессию установленной.
  ///
  /// Порядок важен: `GET /api/auth/me` уходит с access-токеном из хранилища
  /// (`ApiClient` подставляет его интерцептором), поэтому сначала `saveTokens`,
  /// а состояние сессии (`signIn`) меняется последним — роутер уводит на
  /// `/today` уже с проверенной ролью (`auth.md` §7).
  Future<AuthUser> _establishSession(AuthTokens tokens, {String? pinEmail}) async {
    await _session.saveTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    );

    final AuthUser user;
    try {
      user = await _remote.me();
    } on AppException {
      // Роль неизвестна — пускать нельзя: гасим сессию и отдаём ошибку наверх.
      await _session.signOut();
      rethrow;
    }

    if (!_product.allows(user.role)) {
      await _denyRole(tokens);
      throw ForbiddenException(_product.deniedMessage(user.role));
    }

    await _session.signIn(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId: user.id,
      role: user.role,
      fullName: user.fullName,
    );

    final String? email = _firstNonEmpty(<String?>[pinEmail, user.email]);
    if (email != null) await _pinStore.saveEmail(email);

    return user;
  }

  /// Роль `CLIENT`: `POST /api/auth/logout` + очистка защищённого хранилища
  /// (`auth.md` §4.6). Сессия не остаётся «полуоткрытой» ни при какой ошибке.
  Future<void> _denyRole(AuthTokens tokens) async {
    try {
      await _remote.logout(refreshToken: tokens.refreshToken);
    } on AppException {
      // Серверный отзыв не удался (нет сети) — локальную сессию всё равно чистим.
    }
    await _session.signOut();
  }

  /// Email/телефон для будущего входа по PIN — из профиля (`SafeUser`).
  /// Ошибка чтения профиля не отменяет уже выполненную смену PIN.
  Future<void> _rememberPinIdentity() async {
    try {
      final user = await _remote.me();
      if (user.email.isNotEmpty) await _pinStore.saveEmail(user.email);
      final String? phone = user.phone;
      if (phone != null && phone.isNotEmpty) await _pinStore.savePhone(phone);
    } on AppException {
      // PIN уже изменён — отсутствие профиля не ошибка операции.
    }
  }

  /// Общая обвязка: исключения слоя данных превращаются в [Failure].
  Future<AuthResult<T>> _run<T>(Future<T> Function() action) async {
    try {
      return AuthSuccess<T>(await action());
    } on AppException catch (error) {
      return AuthFailure<T>(_translate(error));
    } catch (error) {
      // Сюда попадает всё неожиданное (например, ошибка платформенного плагина):
      // наружу исключение всё равно не выходит.
      return AuthFailure<T>(ServerFailure('Непредвиденная ошибка: $error'));
    }
  }

  /// `AppException` → `Failure`: тексты совпадают с `overview.md` §6.
  static Failure _translate(AppException error) {
    return switch (error) {
      NetworkException() => const NetworkFailure(AuthTexts.network),
      UnauthorizedException() => UnauthorizedFailure(error.message),
      ForbiddenException() => ForbiddenFailure(error.message),
      TooManyRequestsException() => const TooManyRequestsFailure(AuthTexts.tooManyAttempts),
      ValidationException(:final fieldErrors) => ValidationFailure(error.message, fieldErrors: fieldErrors),
      NotFoundException() => NotFoundFailure(error.message),
      ConflictException() => ConflictFailure(error.message),
      StorageException() => StorageFailure(error.message),
      ServerException() => const ServerFailure(AuthTexts.serverUnavailable),
      _ => ServerFailure(error.message),
    };
  }

  static String? _firstNonEmpty(List<String?> values) {
    for (final String? value in values) {
      if (value != null && value.isNotEmpty) return value;
    }
    return null;
  }
}
