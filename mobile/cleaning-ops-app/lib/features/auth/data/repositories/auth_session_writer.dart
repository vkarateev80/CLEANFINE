/// Запись сессии, которой пользуется репозиторий авторизации.
///
/// Реализация — `SessionController` (`presentation/providers/session_provider.dart`):
/// он владеет состоянием сессии и хранилищем токенов, а репозиторий лишь просит
/// его сохранить/сбросить сессию и не зависит от Riverpod.
abstract class AuthSessionWriter {
  /// Сделать пользователя вошедшим: токены в защищённое хранилище + состояние.
  Future<void> signIn({
    required String accessToken,
    required String refreshToken,
    String? userId,
    String? role,
    String? fullName,
  });

  /// Обновить только пару токенов, не меняя состояние сессии (refresh).
  Future<void> saveTokens({required String accessToken, required String refreshToken});

  /// Выход: локальная сессия чистится всегда, даже если серверный logout упал.
  Future<void> signOut();
}
