import '../../../core/i18n/app_language.dart';

/// Дословные тексты экрана SOS (`design/screens/mobile/sos.md` §9).
class SosTexts {
  const SosTexts._();

  static String get title => tr('Аварийная заявка');

  // Поля.
  static String get typeLabel => tr('Тип аварии');
  static String get photoLabel => tr('Фото');
  static String get required => tr('обязательно');
  static String get descriptionLabel => tr('Описание');
  static String get descriptionHint => tr('Что случилось и где');
  static String get locationLabel => tr('Локация');

  // Кнопки.
  static String get submit => tr('🚨 ОТПРАВИТЬ SOS');
  static String get takePhoto => tr('Сделать фото');
  static String get retakePhoto => tr('Переснять');
  static String get retry => tr('Повторить');
  static String get close => tr('Закрыть');
  static String get continueFilling => tr('Продолжить заполнение');
  static String get cancel => tr('Отменить');

  // Подсказки.
  static String get formHint => tr('Заполните тип, фото и описание');
  static String get locating => tr('Определяем местоположение…');

  // Ошибки.
  static String get validation => tr('Выберите тип и сделайте фото');
  static String get locationDenied => tr('Нет доступа к геолокации. Включите GPS и повторите');
  static String get photoTooSmall => tr('Фото слишком маленькое. Снимите заново');
  static String get cameraDenied => tr('Разрешите доступ к камере');
  static String get serviceUnavailable => tr('Сервис временно недоступен. Повторите позже');
  static String get noObject => tr('Не удалось определить объект. Начните смену.');
  static String get photoNotAttached => tr('Фото не прикреплено — прикрепится автоматически');

  /// «Фото отклонено: {текст сервера}. Снимите заново».
  static String photoRejected(String serverMessage) =>
      trArgs('Фото отклонено: {serverMessage}. Снимите заново', <String, Object?>{'serverMessage': serverMessage});

  /// «Ошибка: {текст}» — формат из кода Устава.
  static String generic(String message) =>
      trArgs('Ошибка: {message}', <String, Object?>{'message': message});

  // Оффлайн.
  static String get offlineBanner => tr('Нет соединения — заявка уйдёт при появлении сети');
  static String get queued => tr('Заявка сохранена и будет отправлена');

  // Успех.
  static String get sent => tr('Заявка отправлена');
  static String priorityAndStatus(String priority, String status) =>
      trArgs('Приоритет: {priority} · Статус: {status}', <String, Object?>{'priority': priority, 'status': status});
  static String notified(int count) =>
      trArgs('Оповещены {count} операторов поблизости', <String, Object?>{'count': count});

  // Подтверждение отмены.
  static String get cancelTitle => tr('Отменить заявку SOS?');
  static String get cancelBody => tr('Заполненные данные не сохранятся.');
  static String get back => tr('Назад');
}
