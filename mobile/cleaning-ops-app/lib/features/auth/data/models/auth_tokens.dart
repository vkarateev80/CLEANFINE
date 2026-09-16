/// Пара токенов — ответ `POST /api/auth/login`, `/pin`, `/biometric`, `/refresh`
/// (`TokenPairDto` auth-service: `{accessToken, refreshToken}`).
class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  /// Разбор ответа. Возвращает `null`, если сервер не отдал пару целиком:
  /// решение «это ошибка сервера» принимает datasource, а не модель.
  static AuthTokens? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String access = body['accessToken']?.toString() ?? '';
    final String refresh = body['refreshToken']?.toString() ?? '';
    if (access.isEmpty || refresh.isEmpty) return null;
    return AuthTokens(accessToken: access, refreshToken: refresh);
  }
}
