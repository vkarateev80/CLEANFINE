import '../../../core/i18n/app_language.dart';

/// Дословные тексты экрана чек-листа (`design/screens/mobile/checklist.md` §9).
///
/// Собраны в одном месте, чтобы формулировки не расходились с DS-002: их
/// проверяют widget-тесты, а не «похожесть» строк.
class ChecklistTexts {
  const ChecklistTexts._();

  // Статусы операции.
  static String get start => tr('Начать');
  static String get complete => tr('Завершить');
  static String get completed => tr('Выполнено');
  static String get inProgress => tr('В работе');
  static String get waiting => tr('Ожидает');
  static String get sending => tr('Отправляется…');

  // Блокировка шага.
  static String lockedAfter(String previousOperationName) =>
      trArgs('Доступно после операции «{previousOperationName}»', <String, Object?>{'previousOperationName': previousOperationName});

  // Фото.
  static String get photoRequired => tr('📷 Фото обязательно');
  static String get qrRequired => tr('Требуется QR');
  static String get takePhoto => tr('Сделать фото');
  static String get retakePhoto => tr('Переснять');
  static String get completeOperation => tr('Завершить операцию');
  static String get photoTooSmall => tr('Фото слишком маленькое. Снимите заново');
  static String get photoFirst => tr('Сначала сделайте фото');

  /// Сбой камеры (нет разрешения, занята другим приложением). В DS-002 такого
  /// состояния нет — текст добавлен, чтобы сбой платформы не выглядел падением.
  static String get cameraFailed => tr('Не удалось сделать фото. Попробуйте ещё раз');
  static String get photoWillBeSentLater => tr('Фото сохранится и уйдёт при появлении сети');
  static String get watermarkHint => tr('водяной знак добавит сервер (имя, время, координаты)');

  /// «Фото операции ②» — номер операции в круге.
  static String photoSheetTitle(String number) =>
      trArgs('Фото операции {number}', <String, Object?>{'number': number});

  // Помещение.
  static String get completeRoom => tr('Завершить помещение');
  static String completeRoomWithLeft(int left) =>
      trArgs('Завершить помещение (осталось {left})', <String, Object?>{'left': left});
  static String get roomCompleted => tr('Помещение завершено');
  static String get allOperationsDone => tr('Все операции выполнены');

  // Материалы.
  static String materials(int count) =>
      trArgs('Материалы: {count} поз.; спишет сервер', <String, Object?>{'count': count});

  // Цветовая кодировка инвентаря (shared/types/color-coding.ts, таблички «четыре цвета»).
  /// «Красный инвентарь · Санитарные зоны».
  static String colorZone(String colorName, String zoneName) =>
      trArgs('{colorName} инвентарь · {zoneName}', <String, Object?>{'colorName': colorName, 'zoneName': zoneName});

  /// Пояснение к жёлтому инвентарю у операции в помещении другого цвета.
  static String get glassInventory => tr('Жёлтый инвентарь — стёкла и зеркала');

  // Пустые состояния.
  static String get noOperations => tr('В техкарте нет операций');
  static String get noTechCard => tr('Техкарта не назначена');
  static String get countRoomDone => tr('Считаю помещение выполненным');
  static String get askSupervisor => tr('Обратитесь к бригадиру');

  // Блокировки экрана.
  static String get shiftNotOpen => tr('Смена не открыта — отметки недоступны');
  static String get noTicket => tr('Заявка по смене не создана — отметки недоступны. Обратитесь к бригадиру');

  // Ошибки.
  static String get loadFailed => tr('Не удалось загрузить чек-лист');
  static String get completeFailed => tr('Не удалось завершить операцию. Повторить');
  static String get alreadyCompleted => tr('Операция уже была отмечена');
  static String get retry => tr('Повторить');

  /// «Фото отклонено: {текст сервера}. Снимите заново».
  static String photoRejected(String serverMessage) =>
      trArgs('Фото отклонено: {serverMessage}. Снимите заново', <String, Object?>{'serverMessage': serverMessage});

  // Таймер.
  static String norm(int minutes) =>
      trArgs('норма {minutes} мин', <String, Object?>{'minutes': minutes});
  static String overNorm(String over) =>
      trArgs('+{over} сверх нормы', <String, Object?>{'over': over});

  // Оффлайн.
  static String get offline => tr('Нет соединения — результат сохранится и синхронизируется');

  // Шапка.
  static String title(String roomName, int floorNumber) =>
      trArgs('{roomName} · {floorNumber} этаж', <String, Object?>{'roomName': roomName, 'floorNumber': floorNumber});
  static String techCardSummary(String name, int operations, int minutes) =>
      trArgs('Техкарта: {name} · {operations} операций · ~{minutes} мин', <String, Object?>{'name': name, 'operations': operations, 'minutes': minutes});
  static String routeProgress(int done, int total) =>
      trArgs('Прогресс маршрута: {done} из {total} помещений', <String, Object?>{'done': done, 'total': total});
}
