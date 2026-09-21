
import '../../auth/data/models/auth_roles.dart';

/// Русские подписи ролей (DS-002 `profile.md` §9: «Оператор», «Бригадир»,
/// «Администратор»). Словаря на сервере нет — подписи живут в приложении.
class RoleLabels {
  const RoleLabels._();

  static const Map<String, String> labels = <String, String>{
    AuthRoles.operator: 'Оператор',
    AuthRoles.supervisor: 'Бригадир',
    AuthRoles.admin: 'Администратор',
  };

  /// Незнакомую роль показываем как есть — «сырое» значение честнее пустоты.
  static String of(String role) => labels[role] ?? role;
}

/// Форматирование телефона «+7 999 000-00-03» (`profile.md` §3.1).
///
/// Российские номера приводятся к шаблону; всё остальное показываем без
/// изменений, чтобы не портить данные.
String formatPhone(String? phone) {
  if (phone == null || phone.isEmpty) return '';
  final String digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.length == 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    final String body = digits.substring(1);
    return '+7 ${body.substring(0, 3)} ${body.substring(3, 6)}-'
        '${body.substring(6, 8)}-${body.substring(8, 10)}';
  }
  return phone;
}

/// Инициалы для заглушки аватара (`profile.md` §3.1).
String initialsOf(String fullName) {
  final List<String> parts =
      fullName.split(' ').where((String part) => part.trim().isNotEmpty).toList(growable: false);
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return '${parts[0].substring(0, 1)}${parts[1].substring(0, 1)}'.toUpperCase();
}
