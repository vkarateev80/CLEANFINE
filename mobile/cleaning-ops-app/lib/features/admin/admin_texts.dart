/// Тексты экрана «Доска действий» (вкладка «Админ») — дословно из web-admin
/// (`DashboardPage.tsx`), чтобы цифры и подписи совпадали в двух клиентах.
class AdminTexts {
  const AdminTexts._();

  static const String tabLabel = 'Админ';
  static const String title = 'Доска действий';
  static const String subtitle =
      'Сводка за последние 30 дней: заявки, материалы, персонал, геозоны.';

  static const String loading = 'Считаем KPI…';
  static const String errorTitle = 'Не удалось загрузить дашборд';
  static const String retry = 'Повторить';

  // --- KPI: заявки (ticket-service · ticket_execution_totals)
  static const String kpiTicketsTotal = 'Заявки за 30 дней';
  static const String hintTicketsTotal = 'ticket-service · ticket_execution_totals';
  static const String footerNew = 'новых';
  static const String footerInWork = 'в работе';
  static const String footerOverdue = 'просрочено';

  static const String kpiOnTime = 'В срок';
  static const String hintOnTime = 'доля заявок без просрочки';

  static const String kpiCycle = 'Среднее время цикла';
  static const String hintCycle = 'принятие → выполнение';

  // --- KPI: материалы (material-service · report_material_consumption_daily)
  static const String kpiMaterialsCost = 'Расход материалов';
  static const String hintMaterialsCost = 'material-service · report_material_consumption_daily';
  static const String footerOperations = 'операций';
  static const String footerObjects = 'объектов';

  static const String kpiLowStock = 'Ниже порога';
  static const String hintLowStock = 'позиции склада ниже минимального остатка';

  // --- KPI: персонал (schedule-service · staff_control_totals)
  static const String kpiAttendance = 'Явка персонала';
  static const String hintAttendance = 'schedule-service · staff_control_totals';
  static const String footerShifts = 'смен';
  static const String footerMissed = 'пропущено';

  static const String kpiLate = 'Опозданий';
  static const String hintLate = 'более 15 минут от планового начала';

  // --- KPI: геозоны (gps-service · staff_geofence_control)
  static const String kpiVisits = 'Посещений объектов';
  static const String hintVisits = 'gps-service · staff_geofence_control';
  static const String footerDwell = 'на объектах';
  static const String footerPoints = 'точек';

  // --- графики
  static const String chartTicketsTitle = 'Заявки за 30 дней';
  static const String chartTicketsHint = 'создано и выполнено';
  static const String chartConsumptionTitle = 'Расход по дням';
  static const String chartConsumptionHint = 'стоимость, ₽';
  static const String chartEmpty = 'Нет данных за период';
  static const String seriesCreated = 'создано';
  static const String seriesCompleted = 'выполнено';
}
