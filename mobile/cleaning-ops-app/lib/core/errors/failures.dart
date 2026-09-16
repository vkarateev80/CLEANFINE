/// Ошибки слоя представления: то, что видит пользователь.
///
/// Репозитории ловят `AppException` и возвращают `Failure` — UI показывает
/// `failure.message` и, если есть, подсветку полей из `fieldErrors`.
sealed class Failure {
  const Failure(this.message);

  final String message;
}

/// Нет сети или сервер недоступен.
class NetworkFailure extends Failure {
  const NetworkFailure([super.message = 'Нет соединения с интернетом']);
}

/// Нужно войти заново (токен истёк и refresh не помог).
class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure([super.message = 'Сессия истекла, войдите заново']);
}

/// Роль не позволяет действие.
class ForbiddenFailure extends Failure {
  const ForbiddenFailure([super.message = 'Недостаточно прав для этого действия']);
}

/// Ошибки валидации: общее сообщение + сообщения по полям.
class ValidationFailure extends Failure {
  const ValidationFailure(super.message, {this.fieldErrors = const {}});

  final Map<String, String> fieldErrors;

  /// Сообщение для конкретного поля (для `TextFormField.errorText`).
  String? errorFor(String field) => fieldErrors[field];
}

/// Запись не найдена.
class NotFoundFailure extends Failure {
  const NotFoundFailure([super.message = 'Данные не найдены']);
}

/// Конфликт: например, объект уже занят или действие уже выполнено.
class ConflictFailure extends Failure {
  const ConflictFailure([super.message = 'Действие конфликтует с текущим состоянием']);
}

/// Rate limit: слишком часто.
class TooManyRequestsFailure extends Failure {
  const TooManyRequestsFailure([super.message = 'Слишком много попыток, попробуйте позже']);
}

/// Ошибка сервера (5xx) или неразобранный ответ.
class ServerFailure extends Failure {
  const ServerFailure([super.message = 'Сервис временно недоступен']);
}

/// Локальная ошибка (хранилище, БД, файл).
class StorageFailure extends Failure {
  const StorageFailure([super.message = 'Ошибка локального хранилища']);
}
