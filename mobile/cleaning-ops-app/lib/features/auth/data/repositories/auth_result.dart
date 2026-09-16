import '../../../../core/errors/failures.dart';

/// Результат вызова репозитория.
///
/// Репозиторий авторизации не выбрасывает исключения наружу: `AppException`
/// слоя данных он переводит в [Failure] и возвращает его здесь. Так UI
/// (`AuthController`) не знает ни про Dio, ни про коды ответов.
sealed class AuthResult<T> {
  const AuthResult();

  bool get isSuccess => this is AuthSuccess<T>;

  T? get dataOrNull => this is AuthSuccess<T> ? (this as AuthSuccess<T>).data : null;

  Failure? get failureOrNull =>
      this is AuthFailure<T> ? (this as AuthFailure<T>).failure : null;
}

/// Успех с полезными данными.
final class AuthSuccess<T> extends AuthResult<T> {
  const AuthSuccess(this.data);

  final T data;
}

/// Ошибка, готовая к показу: текст и, если сервер его дал, `fieldErrors`.
final class AuthFailure<T> extends AuthResult<T> {
  const AuthFailure(this.failure);

  final Failure failure;
}
