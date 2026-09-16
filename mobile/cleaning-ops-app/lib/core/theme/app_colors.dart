import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

/// Семантические цвета поверх DS-001: экраны не хардкодят hex-значения,
/// а берут смысловые имена отсюда.
class AppPalette {
  const AppPalette._();

  static const Color primary = Color(AppColors.primary500);
  static const Color primaryDark = Color(AppColors.primary700);
  static const Color primaryLight = Color(AppColors.primary100);

  static const Color background = Color(AppColors.neutral50);
  static const Color surface = Colors.white;
  static const Color surfaceMuted = Color(AppColors.neutral100);
  static const Color border = Color(AppColors.neutral200);

  static const Color textPrimary = Color(AppColors.neutral900);
  static const Color textSecondary = Color(AppColors.neutral500);
  static const Color textOnPrimary = Colors.white;

  static const Color success = Color(AppColors.success500);
  static const Color warning = Color(AppColors.warning500);
  static const Color danger = Color(AppColors.danger500);
  static const Color info = Color(AppColors.info500);
}

/// Статус смены (shared: `SCHEDULE_EVENT_STATUSES`) → цвет и русская подпись.
class ScheduleStatusStyle {
  const ScheduleStatusStyle(this.label, this.color);

  final String label;
  final Color color;

  static const ScheduleStatusStyle planned = ScheduleStatusStyle('Запланирована', AppPalette.info);
  static const ScheduleStatusStyle checkedIn = ScheduleStatusStyle('На смене', AppPalette.success);
  static const ScheduleStatusStyle checkedOut = ScheduleStatusStyle('Завершена', AppPalette.textSecondary);
  static const ScheduleStatusStyle missed = ScheduleStatusStyle('Пропущена', AppPalette.danger);

  /// Неизвестный статус с сервера не должен ломать экран.
  static ScheduleStatusStyle of(String status) => switch (status) {
        'PLANNED' => planned,
        'CHECKED_IN' => checkedIn,
        'CHECKED_OUT' => checkedOut,
        'MISSED' => missed,
        _ => ScheduleStatusStyle(status, AppPalette.textSecondary),
      };
}

/// Статус заявки (shared: `TICKET_STATUSES`) → цвет бейджа.
Color ticketStatusColor(String status) => switch (status) {
      'new' => AppPalette.info,
      'assigned' => AppPalette.primary,
      'in_progress' => AppPalette.warning,
      'paused' => AppPalette.textSecondary,
      'completed' => AppPalette.success,
      'verified' => AppPalette.success,
      'rejected' => AppPalette.danger,
      'closed' => AppPalette.textSecondary,
      'overdue' => AppPalette.danger,
      _ => AppPalette.textSecondary,
    };

/// Приоритет заявки → цвет (для SOS всегда `critical`).
Color ticketPriorityColor(String priority) => switch (priority) {
      'low' => AppPalette.textSecondary,
      'normal' => AppPalette.info,
      'high' => AppPalette.warning,
      'critical' => AppPalette.danger,
      _ => AppPalette.textSecondary,
    };

/// Статус точки маршрута на плане этажа (`design/screens/mobile/route_map.md` §3).
///
/// Подписи и цвета — дословно из спецификации: «Ожидает», «В работе», «Выполнено»,
/// «Пропущено». Сервер прогресс не хранит, поэтому статус считает приложение.
enum RoutePointStatus {
  pending('pending', 'Ожидает', AppPalette.textSecondary),
  active('active', 'В работе', AppPalette.primary),
  done('done', 'Выполнено', AppPalette.success),
  skipped('skipped', 'Пропущено', AppPalette.warning);

  const RoutePointStatus(this.code, this.label, this.color);

  final String code;
  final String label;
  final Color color;

  static RoutePointStatus of(String value) => RoutePointStatus.values.firstWhere(
        (RoutePointStatus status) => status.code == value,
        orElse: () => RoutePointStatus.pending,
      );
}
