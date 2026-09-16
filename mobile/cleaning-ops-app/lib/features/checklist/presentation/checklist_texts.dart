/// Дословные тексты экрана чек-листа (`design/screens/mobile/checklist.md` §9).
///
/// Собраны в одном месте, чтобы формулировки не расходились с DS-002: их
/// проверяют widget-тесты, а не «похожесть» строк.
class ChecklistTexts {
  const ChecklistTexts._();

  // Статусы операции.
  static const String start = 'Начать';
  static const String complete = 'Завершить';
  static const String completed = 'Выполнено';
  static const String inProgress = 'В работе';
  static const String waiting = 'Ожидает';
  static const String sending = 'Отправляется…';

  // Блокировка шага.
  static String lockedAfter(String previousOperationName) =>
      'Доступно после операции «$previousOperationName»';

  // Фото.
  static const String photoRequired = '📷 Фото обязательно';
  static const String qrRequired = 'Требуется QR';
  static const String takePhoto = 'Сделать фото';
  static const String retakePhoto = 'Переснять';
  static const String completeOperation = 'Завершить операцию';
  static const String photoTooSmall = 'Фото слишком маленькое. Снимите заново';
  static const String photoFirst = 'Сначала сделайте фото';

  /// Сбой камеры (нет разрешения, занята другим приложением). В DS-002 такого
  /// состояния нет — текст добавлен, чтобы сбой платформы не выглядел падением.
  static const String cameraFailed = 'Не удалось сделать фото. Попробуйте ещё раз';
  static const String photoWillBeSentLater = 'Фото сохранится и уйдёт при появлении сети';
  static const String watermarkHint =
      'водяной знак добавит сервер (имя, время, координаты)';

  /// «Фото операции ②» — номер операции в круге.
  static String photoSheetTitle(String number) => 'Фото операции $number';

  // Помещение.
  static const String completeRoom = 'Завершить помещение';
  static String completeRoomWithLeft(int left) => 'Завершить помещение (осталось $left)';
  static const String roomCompleted = 'Помещение завершено';
  static const String allOperationsDone = 'Все операции выполнены';

  // Материалы.
  static String materials(int count) => 'Материалы: $count поз.; спишет сервер';

  // Пустые состояния.
  static const String noOperations = 'В техкарте нет операций';
  static const String noTechCard = 'Техкарта не назначена';
  static const String countRoomDone = 'Считаю помещение выполненным';
  static const String askSupervisor = 'Обратитесь к бригадиру';

  // Блокировки экрана.
  static const String shiftNotOpen = 'Смена не открыта — отметки недоступны';
  static const String noTicket =
      'Заявка по смене не создана — отметки недоступны. Обратитесь к бригадиру';

  // Ошибки.
  static const String loadFailed = 'Не удалось загрузить чек-лист';
  static const String completeFailed = 'Не удалось завершить операцию. Повторить';
  static const String alreadyCompleted = 'Операция уже была отмечена';
  static const String retry = 'Повторить';

  /// «Фото отклонено: {текст сервера}. Снимите заново».
  static String photoRejected(String serverMessage) =>
      'Фото отклонено: $serverMessage. Снимите заново';

  // Таймер.
  static String norm(int minutes) => 'норма $minutes мин';
  static String overNorm(String over) => '+$over сверх нормы';

  // Оффлайн.
  static const String offline = 'Нет соединения — результат сохранится и синхронизируется';

  // Шапка.
  static String title(String roomName, int floorNumber) => '$roomName · $floorNumber этаж';
  static String techCardSummary(String name, int operations, int minutes) =>
      'Техкарта: $name · $operations операций · ~$minutes мин';
  static String routeProgress(int done, int total) =>
      'Прогресс маршрута: $done из $total помещений';
}
