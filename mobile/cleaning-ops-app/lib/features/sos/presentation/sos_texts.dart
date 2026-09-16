/// Дословные тексты экрана SOS (`design/screens/mobile/sos.md` §9).
class SosTexts {
  const SosTexts._();

  static const String title = 'Аварийная заявка';

  // Поля.
  static const String typeLabel = 'Тип аварии';
  static const String photoLabel = 'Фото';
  static const String required = 'обязательно';
  static const String descriptionLabel = 'Описание';
  static const String descriptionHint = 'Что случилось и где';
  static const String locationLabel = 'Локация';

  // Кнопки.
  static const String submit = '🚨 ОТПРАВИТЬ SOS';
  static const String takePhoto = 'Сделать фото';
  static const String retakePhoto = 'Переснять';
  static const String retry = 'Повторить';
  static const String close = 'Закрыть';
  static const String continueFilling = 'Продолжить заполнение';
  static const String cancel = 'Отменить';

  // Подсказки.
  static const String formHint = 'Заполните тип, фото и описание';
  static const String locating = 'Определяем местоположение…';

  // Ошибки.
  static const String validation = 'Выберите тип и сделайте фото';
  static const String locationDenied = 'Нет доступа к геолокации. Включите GPS и повторите';
  static const String photoTooSmall = 'Фото слишком маленькое. Снимите заново';
  static const String cameraDenied = 'Разрешите доступ к камере';
  static const String serviceUnavailable = 'Сервис временно недоступен. Повторите позже';
  static const String noObject = 'Не удалось определить объект. Начните смену.';
  static const String photoNotAttached = 'Фото не прикреплено — прикрепится автоматически';

  /// «Фото отклонено: {текст сервера}. Снимите заново».
  static String photoRejected(String serverMessage) =>
      'Фото отклонено: $serverMessage. Снимите заново';

  /// «Ошибка: {текст}» — формат из кода Устава.
  static String generic(String message) => 'Ошибка: $message';

  // Оффлайн.
  static const String offlineBanner = 'Нет соединения — заявка уйдёт при появлении сети';
  static const String queued = 'Заявка сохранена и будет отправлена';

  // Успех.
  static const String sent = 'Заявка отправлена';
  static String priorityAndStatus(String priority, String status) =>
      'Приоритет: $priority · Статус: $status';
  static String notified(int count) => 'Оповещены $count операторов поблизости';

  // Подтверждение отмены.
  static const String cancelTitle = 'Отменить заявку SOS?';
  static const String cancelBody = 'Заполненные данные не сохранятся.';
  static const String back = 'Назад';
}
