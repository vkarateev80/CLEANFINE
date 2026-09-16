import '../../core/errors/exceptions.dart';
import '../../core/errors/failures.dart';

/// Результат вызова репозитория: наружу не выходят ни Dio, ни `AppException`.
///
/// Тот же приём, что в фиче авторизации (`AuthResult`): UI получает либо данные,
/// либо готовый к показу [Failure].
sealed class Result<T> {
  const Result();

  bool get isSuccess => this is Ok<T>;
  T? get dataOrNull => this is Ok<T> ? (this as Ok<T>).data : null;
  Failure? get failureOrNull => this is Err<T> ? (this as Err<T>).failure : null;
}

final class Ok<T> extends Result<T> {
  const Ok(this.data);

  final T data;
}

final class Err<T> extends Result<T> {
  const Err(this.failure);

  final Failure failure;
}

/// `AppException` → [Failure] с русским текстом, пригодным для показа.
///
/// Тексты берутся из самого исключения (`ApiClient` уже подставил серверное
/// сообщение, если оно было) — специфичные для входа формулировки живут в
/// `features/auth` (`auth_error_messages.dart`).
Failure mapFailure(AppException error) {
  return switch (error) {
    NetworkException() => NetworkFailure(error.message),
    UnauthorizedException() => UnauthorizedFailure(error.message),
    ForbiddenException() => ForbiddenFailure(error.message),
    TooManyRequestsException() => TooManyRequestsFailure(error.message),
    ValidationException(:final Map<String, String> fieldErrors) =>
      ValidationFailure(error.message, fieldErrors: fieldErrors),
    NotFoundException() => NotFoundFailure(error.message),
    ConflictException() => ConflictFailure(error.message),
    StorageException() => StorageFailure(error.message),
    ServerException() => ServerFailure(error.message),
    _ => ServerFailure(error.message),
  };
}

/// Обёртка вызова: исключения слоя данных превращаются в [Err].
Future<Result<T>> guard<T>(Future<T> Function() action) async {
  try {
    return Ok<T>(await action());
  } on AppException catch (error) {
    return Err<T>(mapFailure(error));
  } on Exception catch (error) {
    return Err<T>(ServerFailure('Непредвиденная ошибка: $error'));
  }
}
