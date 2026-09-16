import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../auth_texts.dart';
import '../../data/models/auth_user.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/auth_result.dart';
import '../auth_error_messages.dart';
import 'auth_providers.dart';

/// Состояние запроса на экранах входа.
///
/// Одно на пакет входа: одновременно виден только один экран (`/login`, `/pin`,
/// `/pin/setup`), а состояние полностью сбрасывается в начале каждого запроса.
class AuthState {
  const AuthState({this.isSubmitting = false, this.errorMessage, this.user, this.email});

  /// Запрос в полёте: кнопки `disabled`, повторный tap не создаёт второй запрос.
  final bool isSubmitting;

  /// Готовый русский текст ошибки (см. [AuthErrorMessages]).
  final String? errorMessage;

  /// Профиль последнего успешного входа.
  final AuthUser? user;

  /// Email последнего успешного входа (сохраняется в `pin_email` репозиторием).
  final String? email;

  bool get hasError => errorMessage != null;
}

/// Контроллер форм входа: экраны не знают ни про Dio, ни про `Failure`.
///
/// Возвращает `true`, если операция прошла: на успехе сессия уже установлена
/// (`SessionController`), и переход на `/today` делает guard роутера
/// (`app_router.dart` слушает `sessionProvider`).
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  AuthRepository get _repository => ref.read(authRepositoryProvider);

  /// Вход по email и паролю.
  Future<bool> login({required String email, required String password}) async {
    state = const AuthState(isSubmitting: true);
    final result = await _repository.login(email: email, password: password);
    return _finish(result, unauthorizedText: AuthTexts.invalidCredentials, email: email);
  }

  /// Вход по PIN. Email/телефон репозиторий берёт из защищённого хранилища.
  Future<bool> loginWithPin({required String pin}) async {
    state = const AuthState(isSubmitting: true);
    final result = await _repository.loginWithPin(pin: pin);
    return _finish(result, unauthorizedText: AuthTexts.invalidPin);
  }

  /// Вход по отпечатку: локальная биометрия уже подтверждена экраном.
  Future<bool> loginWithBiometric() async {
    state = const AuthState(isSubmitting: true);
    final result = await _repository.loginWithBiometric();
    return _finish(result, unauthorizedText: AuthTexts.biometricNotRecognized);
  }

  /// Установка/смена PIN (`POST /api/auth/change-pin`).
  Future<bool> changePin({required String currentPassword, required String newPin}) async {
    state = const AuthState(isSubmitting: true);
    final result = await _repository.changePin(
      currentPassword: currentPassword,
      newPin: newPin,
    );
    return _finish(result, unauthorizedText: AuthTexts.wrongCurrentPassword);
  }

  /// Смена пароля (`POST /api/auth/change-password`).
  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    state = const AuthState(isSubmitting: true);
    final result = await _repository.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
    return _finish(result, unauthorizedText: AuthTexts.wrongCurrentPassword);
  }

  /// Очистить ошибку (пользователь начал исправлять ввод).
  void clearError() {
    if (state.hasError || state.user != null) state = const AuthState();
  }

  bool _finish<T>(
    AuthResult<T> result, {
    required String unauthorizedText,
    String? email,
  }) {
    final Failure? failure = result.failureOrNull;
    if (failure != null) {
      state = AuthState(
        errorMessage: AuthErrorMessages.of(failure, unauthorizedText: unauthorizedText),
      );
      return false;
    }

    final T? data = result.dataOrNull;
    state = AuthState(
      user: data is AuthUser ? data : null,
      email: email ?? (data is AuthUser ? data.email : null),
    );
    return true;
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
