/// Дословные тексты экранов чата (DS-002 `chat.md` §9).
///
/// Отдельный класс, а не строки по месту: тексты утверждены спецификацией, и
/// widget-тесты §10 ищут именно их.
class ChatTexts {
  const ChatTexts._();

  // Заголовки
  static const String listTitle = 'Чаты';
  static const String ticketChat = 'Чат заявки';
  static const String objectChat = 'Чат объекта';
  static const String directChat = 'Личные сообщения';
  static const String systemChat = 'Системные уведомления';
  static const String ticketTitle = 'Заявка';

  // Список
  static const String noMessages = 'Сообщений пока нет';
  static const String youPrefix = 'Вы: ';
  static const String today = 'Сегодня';
  static const String yesterday = 'Вчера';

  // Пустые состояния
  static const String emptyChats = 'Чатов пока нет';
  static const String emptyChatsHint =
      'Чат появится, когда бригадир создаст его по объекту или заявке';
  static const String emptyThread = 'Напишите первое сообщение';
  static const String emptyThreadHint = 'Опишите вопрос — ответ придёт в это окно';

  // Поле ввода
  static const String inputHint = 'Напишите сообщение…';

  // Статусы
  static const String connection = 'соединение…';
  static const String online = 'в сети';
  static const String recently = 'был(а) недавно';
  static const String readUpTo = 'Прочитано до';

  // Ошибки
  static const String chatsLoadError = 'Не удалось загрузить чаты';
  static const String threadLoadError = 'Не удалось загрузить переписку';
  static const String chatUnavailable = 'Чат недоступен';
  static const String chatTemporarilyUnavailable = 'Чат временно недоступен';
  static const String emptyMessage = 'Сообщение не может быть пустым';
  static const String tooLongMessage = 'Сообщение длиннее 4000 символов';
  static const String tooManyAttachments = 'Слишком много вложений (максимум 20)';

  // Оффлайн
  static const String offline = 'Нет соединения — сообщения уйдут при подключении';
  static const String offlineQueued = 'Сообщение уйдёт при появлении сети';

  // История
  static const String historyStart = 'Начало переписки';

  // Кнопки
  static const String retry = 'Повторить';
  static const String backToChats = 'К чатам';

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
