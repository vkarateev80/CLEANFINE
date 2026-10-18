import '../../../core/i18n/app_language.dart';

/// Дословные тексты экрана профиля (DS-002 `profile.md` §9).
class ProfileTexts {
  const ProfileTexts._();

  // Заголовок и секции
  static String get title => tr('Профиль');
  static String get accessSection => tr('Доступ');
  static String get gpsSection => tr('GPS-трекинг');
  static String get dataSection => tr('Уведомления и данные');

  // Карточка
  static String get changePhoto => tr('Изменить фото');
  static String get camera => tr('Камера');
  static String get gallery => tr('Галерея');

  // Пункты
  static String get changePin => tr('Сменить PIN');
  static String get changePassword => tr('Сменить пароль');
  static String get notifications => tr('Уведомления');
  static String get queue => tr('Очередь отправки');
  static String get clearCache => tr('Очистить кэш планов и фото');
  static String get about => tr('О приложении');
  static String get logout => tr('Выйти');

  // Уведомления
  static String get save => tr('Сохранить');
  static String get settingsLoadError => tr('Не удалось загрузить настройки');
  static String get settingsOffline => tr('Нет соединения. Настройки не сохранены.');
  static String get testNotification => tr('Показать тестовое уведомление');

  // Данные
  static String get clearCacheDialog => tr('Очистить кэш? Планы и отправленные фото будут скачаны заново.');
  static String get clear => tr('Очистить');
  static String get cancel => tr('Отмена');

  // Выход
  static String get logoutDialogTitle => tr('Выйти из аккаунта?');
  static String get logoutLocalError => tr('Не удалось выйти. Попробуйте позже');

  // Пароль
  static String get passwordTitle => tr('Смена пароля');
  static String get currentPassword => tr('Текущий пароль');
  static String get newPassword => tr('Новый пароль');
  static String get repeatPassword => tr('Повторите новый пароль');
  static String get passwordsMismatch => tr('Пароли не совпадают');
  static String get passwordChanged => tr('Пароль изменён. Войдите заново.');
  static String get wrongCurrentPassword => tr('Текущий пароль указан неверно');
  static String get shortPassword => tr('Новый пароль должен быть не короче 6 символов');

  // Ошибки
  static String get retry => tr('Повторить');
  static String get profileLoadError => tr('Не удалось загрузить профиль');
  static String get photoRejected => tr('Фото отклонено');
  static String get offlineLater => tr('Нет соединения. Попробуйте позже');

  /// «{N} действий» — счётчик очереди (`profile.md` §9).
  static String actions(int count) =>
      trArgs('{count} действий', <String, Object?>{'count': count});

  /// «Неотправленные действия ({N}) будут потеряны.» — предупреждение в диалоге.
  static String logoutWarning(int count) =>
      trArgs('Неотправленные действия ({count}) будут потеряны.', <String, Object?>{'count': count});

  /// «версия {v}».
  static String version(String value) =>
      trArgs('версия {value}', <String, Object?>{'value': value});
}
