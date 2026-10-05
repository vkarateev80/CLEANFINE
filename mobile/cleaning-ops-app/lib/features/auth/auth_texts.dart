/// Дословные русские тексты пакета входа.
///
/// Источник — `design/screens/mobile/auth.md` §10 («Тексты интерфейса»), §4.6
/// («Блокировки и отказы») и `УСТАВ.md`. Строки не переписываются «по-своему»:
/// по ним написаны widget-тесты М6.2, поэтому они собраны в одном месте и не
/// дублируются по экранам.
class AuthTexts {
  const AuthTexts._();

  // Шапка и подписи (auth.md §3.1, §10).
  static const String appTitle = '🧹 CLEANFINE';
  static const String appSubtitle = 'Приложение оператора';
  static const String emailLabel = 'Email';
  static const String passwordLabel = 'Пароль';
  static const String forgotPasswordHint = 'Забыли пароль? Обратитесь к бригадиру.';

  // Кнопки (auth.md §10).
  static const String signIn = 'Войти';
  static const String signInWithPin = 'Войти по PIN';
  static const String signInWithBiometrics = 'Войти по отпечатку';
  static const String savePin = 'Сохранить PIN';
  static const String signInWithPassword = 'Войти по паролю';
  static const String pinTitle = 'Вход по PIN';
  static const String pinSetupTitle = 'Новый PIN';
  static const String pinHint = 'Введите PIN из 4–6 цифр';
  static const String forgotPin = 'Забыли PIN? Введите пароль';
  static const String pinStoredOnServer =
      'PIN хранится на сервере в виде хэша и не передаётся в чат.';

  // Поля экрана установки PIN (auth.md §5.3).
  static const String currentPasswordLabel = 'Текущий пароль';
  static const String newPinLabel = 'Новый PIN (4–6 цифр)';
  static const String repeatPinLabel = 'Повторите PIN';

  // Клиентская валидация (auth.md §4.4, `Validators`).
  static const String enterPassword = 'Введите пароль';
  static const String pinFormat = 'PIN должен содержать 4–6 цифр';
  static const String pinMismatch = 'PIN не совпадает';

  // Ошибки сервера и отказы (auth.md §4.6, overview.md §6).
  static const String invalidCredentials = 'Неверный email или пароль';
  static const String invalidPin = 'Неверный PIN';
  static const String clientRoleDenied =
      'Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.';
  static const String network = 'Нет соединения. Проверьте интернет';
  static const String tooManyAttempts = 'Слишком много попыток. Попробуйте позже';
  static const String serverUnavailable = 'Сервис временно недоступен. Повторите позже';
  static const String wrongCurrentPassword = 'Текущий пароль указан неверно';
  static const String deactivatedAccount =
      'Учётная запись деактивирована. Обратитесь к бригадиру.';

  /// `auth.md` §4.6: PIN ещё не задан на сервере (`ChangePinDto` без PIN).
  static const String pinNotSet = 'PIN не установлен. Войдите по паролю и установите PIN.';

  /// `auth.md` п. 10.2: `POST /api/auth/change-pin` требует `currentPassword`
  /// под JWT — без активной сессии установить PIN нечем (отдельного эндпоинта
  /// «установить PIN без пароля» в auth-service нет).
  static const String pinSetupNeedsPassword =
      'Установить PIN можно только после входа по паролю: '
      'сервер требует текущий пароль (POST /api/auth/change-pin).';

  /// Ключ устройства не сохранён (кнопка биометрии в этом случае не рисуется).
  static const String biometricKeyMissing = 'Биометрический ключ не сохранён на устройстве';
  static const String biometricNotRecognized = 'Биометрический ключ не распознан';
  static const String biometricReason = 'Войдите по отпечатку';
  static const String showPassword = 'Показать пароль';
  static const String hidePassword = 'Скрыть пароль';
  static const String splashCheck = 'Проверка сессии…';
}
