/// Тексты портала заказчика в приложении «Команда» — дословно из веб-портала
/// (`frontend/web-client`, DS-004), чтобы клиент видел одно и то же в вебе и
/// на телефоне.
class ClientTexts {
  const ClientTexts._();

  // Главная («Статус объекта»).
  static const String homeTitle = 'Мой объект';
  static const String noObjectTitle = 'Объект не привязан';
  static const String noObjectHint = 'К вашей учётной записи ещё не привязан объект. Обратитесь к менеджеру.';
  static const String archived = 'Объект в архиве. Обслуживание приостановлено.';
  static const String paused = 'Обслуживание приостановлено. Данные показаны по последнему состоянию.';
  static const String passportType = 'Тип';
  static const String passportArea = 'Площадь';
  static const String passportFloors = 'Этажей';
  static const String passportRooms = 'Помещений';
  static const String passportNext = 'Следующая уборка';
  static const String passportLast = 'Последняя уборка';
  static const String notPlanned = 'не запланирована';
  static const String kpiOpen = 'Открытые заявки';
  static const String kpiDone30 = 'Выполнено за 30 дней';
  static const String kpiNextShift = 'Ближайшая смена';
  static const String kpiNone = 'нет';
  static const String upcomingShifts = 'Ближайшие смены';
  static const String noShiftsTitle = 'Уборок пока не запланировано';
  static const String noShiftsHint = 'Менеджер добавит график.';
  static const String recentTickets = 'Последние заявки';
  static const String allTickets = 'Все';
  static const String noTicketsTitle = 'Заявок пока нет';
  static const String noTicketsHint = 'Опишите проблему — менеджер получит заявку сразу.';
  static const String createTicket = 'Создать заявку';
  static const String loadFailed = 'Не удалось загрузить данные';
  static const String retry = 'Повторить';

  // Список заявок.
  static const String ticketsTitle = 'Заявки';
  static const String filterAll = 'Все';
  static const String filterOpen = 'Открытые';
  static const String filterDone = 'Выполненные';
  static const String nothingFoundTitle = 'Ничего не найдено';
  static const String nothingFoundHint = 'В этом фильтре заявок нет.';
  static const String showAll = 'Показать все';
  static const String loadMore = 'Показать ещё';
  static String shownAll(int total) => 'Показано все $total заявок';
  static String overdueSince(String when) => 'Просрочена с $when';
  static const String assigneeSet = 'Исполнитель назначен';

  // Создание заявки.
  static const String newTicket = 'Новая заявка';
  static const String whatHappened = 'Что случилось?';
  static const String describeHint = 'Чем точнее опишете, тем быстрее приедет исполнитель';
  static const String describePlaceholder = 'Опишите проблему: где, что, когда заметили';
  static const int descriptionMin = 10;
  static const int descriptionMax = 2000;
  static String tooShort(int min) => 'Опишите проблему подробнее — минимум $min символов';
  static String tooLong(int max) => 'Слишком длинное описание — максимум $max символов';
  static const String floorLabel = 'Этаж';
  static const String roomLabel = 'Помещение';
  static const String anyFloor = 'Не указан';
  static const String anyRoom = 'Не указано';
  static const String typeLabel = 'Тип заявки';
  static const String typeUnscheduled = 'Внеплановая';
  static const String typePlanned = 'Плановая';
  static const String send = 'Отправить';
  static const String cancel = 'Отмена';
  static const String created = 'Заявка создана — менеджер получил её';
  static const String discardTitle = 'Отменить заявку?';
  static const String discardHint = 'Введённый текст будет потерян.';
  static const String discardYes = 'Отменить';
  static const String discardNo = 'Продолжить ввод';

  // Карточка заявки.
  static const String ticketTitle = 'Заявка';
  static const String description = 'Описание';
  static const String progress = 'Ход работы';
  static String operations(int done, int? total) =>
      'Операций выполнено: $done${total == null ? '' : ' из $total'}';
  static const String waitingAssignee = 'Заявка принята и ждёт назначения исполнителя.';
  static const String comments = 'Переписка';
  static const String noComments = 'Комментариев пока нет.';
  static const String you = 'Вы';
  static const String manager = 'Менеджер';
  static const String clarify = 'Уточнить детали';
  static const String clarifyPlaceholder = 'Например: доступ в помещение через охрану';
  static const String commentSent = 'Комментарий отправлен — менеджер увидит его в карточке заявки.';
  static const String ticketUnavailable = 'Заявка не найдена или доступна только по вашему объекту';
  static const String backToTickets = 'К списку заявок';
  static const String stepCreated = 'Создана';
  static const String stepArrived = 'Исполнитель выехал';
  static const String stepAccepted = 'Принята в работу';
}
