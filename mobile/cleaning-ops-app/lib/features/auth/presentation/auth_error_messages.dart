import '../../../core/errors/failures.dart';
import '../auth_texts.dart';

/// Единый маппинг `Failure` → текст, который видит оператор.
///
/// `auth.md` §4.6 / `overview.md` §6: тексты ошибок не «сочиняются» экраном.
/// Единственное, что знает вызывающий, — какой именно вход он выполнял: сервер
/// отдаёт 401 без текста (`ApiClient` превращает 401 в `UnauthorizedException`
/// без сообщения), поэтому нужный текст подставляет вызывающая сторона.
class AuthErrorMessages {
  const AuthErrorMessages._();

  /// [unauthorizedText] — текст для 401 в контексте операции:
  /// «Неверный email или пароль» на логине, «Неверный PIN» на PIN и т. д.
  static String of(Failure failure, {required String unauthorizedText}) {
    return switch (failure) {
      UnauthorizedFailure() => unauthorizedText,
      NetworkFailure() => AuthTexts.network,
      TooManyRequestsFailure() => AuthTexts.tooManyAttempts,
      ServerFailure() => AuthTexts.serverUnavailable,
      StorageFailure() => failure.message,
      // Тексты сервера (400) и локальные состояния («PIN не установлен»,
      // «биометрический ключ не сохранён») показываются как есть.
      _ => failure.message,
    };
  }
}
