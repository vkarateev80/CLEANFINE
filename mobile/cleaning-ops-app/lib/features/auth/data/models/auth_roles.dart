/// Роли пользователя — значения Prisma-enum auth-service
/// (`shared/types/roles.ts`: `OPERATOR | SUPERVISOR | ADMIN | CLIENT`).
class AuthRoles {
  const AuthRoles._();

  static const String operator = 'OPERATOR';
  static const String supervisor = 'SUPERVISOR';
  static const String admin = 'ADMIN';
  static const String client = 'CLIENT';

  /// Роли, допущенные в приложение оператора (`overview.md` §2).
  /// `CLIENT` пользуется порталом заказчика (DS-004).
  static const Set<String> allowed = <String>{operator, supervisor, admin};
}
