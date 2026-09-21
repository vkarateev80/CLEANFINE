/// Дословные тексты экрана профиля (DS-002 `profile.md` §9).
class ProfileTexts {
  const ProfileTexts._();

  // Заголовок и секции
  static const String title = 'Профиль';
  static const String accessSection = 'Доступ';
  static const String gpsSection = 'GPS-трекинг';
  static const String dataSection = 'Уведомления и данные';

  // Карточка
  static const String changePhoto = 'Изменить фото';
  static const String camera = 'Камера';
  static const String gallery = 'Галерея';

  // Пункты
  static const String changePin = 'Сменить PIN';
  static const String changePassword = 'Сменить пароль';
  static const String notifications = 'Уведомления';
  static const String queue = 'Очередь отправки';
  static const String clearCache = 'Очистить кэш планов и фото';
  static const String about = 'О приложении';
  static const String logout = 'Выйти';

  // Уведомления
  static const String save = 'Сохранить';
  static const String settingsLoadError = 'Не удалось загрузить настройки';
  static const String settingsOffline = 'Нет соединения. Настройки не сохранены.';
  static const String testNotification = 'Показать тестовое уведомление';

  // Данные
  static const String clearCacheDialog = 'Очистить кэш? Планы и отправленные фото будут скачаны заново.';
  static const String clear = 'Очистить';
  static const String cancel = 'Отмена';

  // Выход
  static const String logoutDialogTitle = 'Выйти из аккаунта?';
  static const String logoutLocalError = 'Не удалось выйти. Попробуйте позже';

  // Пароль
  static const String passwordTitle = 'Смена пароля';
  static const String currentPassword = 'Текущий пароль';
  static const String newPassword = 'Новый пароль';
  static const String repeatPassword = 'Повторите новый пароль';
  static const String passwordsMismatch = 'Пароли не совпадают';
  static const String passwordChanged = 'Пароль изменён. Войдите заново.';
  static const String wrongCurrentPassword = 'Текущий пароль указан неверно';
  static const String shortPassword = 'Новый пароль должен быть не короче 6 символов';

  // Ошибки
  static const String retry = 'Повторить';
  static const String profileLoadError = 'Не удалось загрузить профиль';
  static const String photoRejected = 'Фото отклонено';
  static const String offlineLater = 'Нет соединения. Попробуйте позже';

  /// «{N} действий» — счётчик очереди (`profile.md` §9).
  static String actions(int count) => '$count действий';

  /// «Неотправленные действия ({N}) будут потеряны.» — предупреждение в диалоге.
  static String logoutWarning(int count) =>
      'Неотправленные действия ($count) будут потеряны.';

  /// «версия {v}».
  static String version(String value) => 'версия $value';
}
