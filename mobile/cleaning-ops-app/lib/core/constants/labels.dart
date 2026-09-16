/// Русские подписи словарей, общие для экранов оператора.
///
/// Значения совпадают с `shared/types/*` и с админкой (`frontend/web-admin/src/types/tickets.ts`),
/// чтобы один и тот же статус назывался одинаково в вебе и в приложении.
class ScheduleStatusLabels {
  const ScheduleStatusLabels._();

  static const Map<String, String> labels = <String, String>{
    'PLANNED': 'Запланирована',
    'CHECKED_IN': 'Открыта',
    'CHECKED_OUT': 'Закрыта',
    'MISSED': 'Неявка',
  };

  static String of(String status) => labels[status] ?? status;
}

class TicketLabels {
  const TicketLabels._();

  static const Map<String, String> statuses = <String, String>{
    'new': 'Новая',
    'assigned': 'Назначена',
    'in_progress': 'В работе',
    'paused': 'Приостановлена',
    'completed': 'Выполнена',
    'verified': 'Проверена',
    'rejected': 'Отклонена',
    'closed': 'Закрыта',
    'overdue': 'Просрочена',
  };

  static const Map<String, String> types = <String, String>{
    'planned': 'Плановая',
    'unscheduled': 'Внеплановая',
    'emergency': 'Аварийная (SOS)',
  };

  static const Map<String, String> priorities = <String, String>{
    'low': 'Низкий',
    'normal': 'Обычный',
    'high': 'Высокий',
    'critical': 'Критичный',
  };

  static String status(String value) => statuses[value] ?? value;
  static String type(String value) => types[value] ?? value;
  static String priority(String value) => priorities[value] ?? value;
}
