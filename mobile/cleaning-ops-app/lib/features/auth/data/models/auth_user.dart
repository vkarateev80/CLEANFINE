import 'auth_roles.dart';

/// Пользователь — публичные поля `GET /api/auth/me`
/// (`backend/auth-service/src/users/user.mapper.ts` → `SafeUser`).
///
/// Полей `passwordHash`, `pinCode`, `biometricKey` в ответе нет — приложение их
/// и не ожидает: серверный `me()` отдаёт только этот набор.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.phone,
    this.avatarUrl,
    this.isActive = true,
  });

  final String id;
  final String email;
  final String fullName;
  final String role;
  final String? phone;
  final String? avatarUrl;
  final bool isActive;

  /// Роль `CLIENT` в приложение оператора не пускается (`overview.md` §2).
  bool get isClient => role == AuthRoles.client;

  /// `OPERATOR` / `SUPERVISOR` / `ADMIN`.
  bool get isAllowed => AuthRoles.allowed.contains(role);

  /// Разбор `SafeUser`. Обязательны `id` и `role` — без них приложение не знает,
  /// кого пускать; остальное подставляется безопасными значениями по умолчанию.
  static AuthUser? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    final String role = body['role']?.toString() ?? '';
    if (id.isEmpty || role.isEmpty) return null;

    final dynamic phone = body['phone'];
    final dynamic avatar = body['avatarUrl'];
    final dynamic active = body['isActive'];
    return AuthUser(
      id: id,
      email: body['email']?.toString() ?? '',
      fullName: body['fullName']?.toString() ?? '',
      role: role,
      phone: phone?.toString(),
      avatarUrl: avatar?.toString(),
      isActive: active is bool ? active : true,
    );
  }
}
