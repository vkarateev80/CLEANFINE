/// Исключения слоя данных: то, что реально пришло от сети/сервера.
///
/// Наружу (в UI) они не выходят: репозиторий переводит их в `Failure`
/// (`core/errors/failures.dart`) и отдаёт в Riverpod-состояние.
class AppException implements Exception {
  const AppException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => '$runtimeType($statusCode): $message';
}

/// Сети нет или сервер недоступен: запрос не дошёл.
class NetworkException extends AppException {
  const NetworkException([super.message = 'Нет соединения с сервером']);
}

/// 401: токен отсутствует, истёк или отозван.
class UnauthorizedException extends AppException {
  const UnauthorizedException([super.message = 'Требуется вход']) : super(statusCode: 401);
}

/// 403: роль не позволяет действие.
class ForbiddenException extends AppException {
  const ForbiddenException([super.message = 'Недостаточно прав']) : super(statusCode: 403);
}

/// 400: серверная валидация. `fieldErrors` — сообщения по полям, если сервер их отдал.
class ValidationException extends AppException {
  const ValidationException(super.message, {this.fieldErrors = const {}})
      : super(statusCode: 400);

  final Map<String, String> fieldErrors;
}

/// 404: сущности нет или она недоступна пользователю.
class NotFoundException extends AppException {
  const NotFoundException([super.message = 'Не найдено']) : super(statusCode: 404);
}

/// 409: конфликт (например, повторная регистрация или занятый номер помещения).
class ConflictException extends AppException {
  const ConflictException([super.message = 'Конфликт данных']) : super(statusCode: 409);
}

/// 429: сработал rate limit (логин — 5 попыток в минуту).
class TooManyRequestsException extends AppException {
  const TooManyRequestsException([super.message = 'Слишком много попыток, попробуйте позже'])
      : super(statusCode: 429);
}

/// 5xx и всё, что не разобрали: сервер сломался.
class ServerException extends AppException {
  const ServerException([super.message = 'Ошибка сервера', int? statusCode])
      : super(statusCode: statusCode);
}

/// Локальная ошибка хранилища (secure storage, drift, файлы).
class StorageException extends AppException {
  const StorageException([super.message = 'Ошибка локального хранилища']);
}
