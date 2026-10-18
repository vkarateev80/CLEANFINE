import '../../../core/i18n/app_language.dart';

/// Дословные тексты экранов чата (DS-002 `chat.md` §9).
///
/// Отдельный класс, а не строки по месту: тексты утверждены спецификацией, и
/// widget-тесты §10 ищут именно их.
class ChatTexts {
  const ChatTexts._();

  // Заголовки
  static String get listTitle => tr('Чаты');
  static String get ticketChat => tr('Чат заявки');
  static String get objectChat => tr('Чат объекта');
  static String get directChat => tr('Личные сообщения');
  static String get systemChat => tr('Системные уведомления');
  static String get ticketTitle => tr('Заявка');

  // Список
  static String get noMessages => tr('Сообщений пока нет');
  static String get youPrefix => tr('Вы: ');
  static String get today => tr('Сегодня');
  static String get yesterday => tr('Вчера');

  // Пустые состояния
  static String get emptyChats => tr('Чатов пока нет');
  static String get emptyChatsHint => tr('Чат появится, когда бригадир создаст его по объекту или заявке');
  static String get emptyThread => tr('Напишите первое сообщение');
  static String get emptyThreadHint => tr('Опишите вопрос — ответ придёт в это окно');

  // Поле ввода
  static String get inputHint => tr('Напишите сообщение…');

  // Статусы
  static String get connection => tr('соединение…');
  static String get online => tr('в сети');
  static String get recently => tr('был(а) недавно');
  static String get readUpTo => tr('Прочитано до');

  // Ошибки
  static String get chatsLoadError => tr('Не удалось загрузить чаты');
  static String get threadLoadError => tr('Не удалось загрузить переписку');
  static String get chatUnavailable => tr('Чат недоступен');
  static String get chatTemporarilyUnavailable => tr('Чат временно недоступен');
  static String get emptyMessage => tr('Сообщение не может быть пустым');
  static String get tooLongMessage => tr('Сообщение длиннее 4000 символов');
  static String get tooManyAttachments => tr('Слишком много вложений (максимум 20)');

  // Вложения из приложения (15.10.2026).
  static String get attachTooltip => tr('Прикрепить фото или файл');
  static String get attachCamera => tr('Сделать фото');
  static String get attachGallery => tr('Выбрать из галереи');
  static String get attachFile => tr('Выбрать файл');
  static String get attachmentsNeedNetwork => tr('Вложения отправляются только при соединении');
  static String get attachmentUploadFailed => tr('не удалось загрузить');
  static String get attachmentPickFailed => tr('Не удалось выбрать файл');
  static String get attachmentBlocked => tr('исполняемые файлы, скрипты, HTML и SVG прикреплять нельзя');
  static String get attachmentEmpty => tr('файл пустой');
  static String get attachmentTooLarge => tr('больше 50 МБ');
  static String get attachmentOpenFailed => tr('Не удалось открыть файл');
  static String get tooManyAttachmentsPick => tr('Можно прикрепить не больше 10 файлов за раз');

  // Оффлайн
  static String get offline => tr('Нет соединения — сообщения уйдут при подключении');
  static String get offlineQueued => tr('Сообщение уйдёт при появлении сети');

  // История
  static String get historyStart => tr('Начало переписки');

  // Кнопки
  static String get retry => tr('Повторить');
  static String get backToChats => tr('К чатам');

  /// Заголовок списка чатов по типу, когда сервер не дал `title` (`chat.md` §3.1).
  ///
  /// Для `direct` спецификация предлагает имя участника из `ChatDetail.members`,
  /// но имён в API нет — `members` содержит только `userId` (`chat.md` п. 11.7),
  /// поэтому показываем родовое название, а не выдуманное имя.
  static String titleForType(String type) => switch (type) {
        'ticket' => ticketChat,
        'object' => objectChat,
        'system' => systemChat,
        _ => directChat,
      };
}
