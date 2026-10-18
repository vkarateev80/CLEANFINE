import '../../core/i18n/app_language.dart';

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
  static String get appSubtitle => tr('Приложение оператора');
  static const String emailLabel = 'Email';
  static String get passwordLabel => tr('Пароль');
  static String get forgotPasswordHint => tr('Забыли пароль? Обратитесь к бригадиру.');

  // Кнопки (auth.md §10).
  static String get signIn => tr('Войти');
  static String get signInWithPin => tr('Войти по PIN');
  static String get signInWithBiometrics => tr('Войти по отпечатку');
  static String get savePin => tr('Сохранить PIN');
  static String get signInWithPassword => tr('Войти по паролю');
  static String get pinTitle => tr('Вход по PIN');
  static String get pinSetupTitle => tr('Новый PIN');
  static String get pinHint => tr('Введите PIN из 4–6 цифр');
  static String get forgotPin => tr('Забыли PIN? Введите пароль');
  static String get pinStoredOnServer => tr('PIN хранится на сервере в виде хэша и не передаётся в чат.');

  // Поля экрана установки PIN (auth.md §5.3).
  static String get currentPasswordLabel => tr('Текущий пароль');
  static String get newPinLabel => tr('Новый PIN (4–6 цифр)');
  static String get repeatPinLabel => tr('Повторите PIN');

  // Клиентская валидация (auth.md §4.4, `Validators`).
  static String get enterPassword => tr('Введите пароль');
  static String get pinFormat => tr('PIN должен содержать 4–6 цифр');
  static String get pinMismatch => tr('PIN не совпадает');

  // Ошибки сервера и отказы (auth.md §4.6, overview.md §6).
  static String get invalidCredentials => tr('Неверный email или пароль');
  static String get invalidPin => tr('Неверный PIN');
  static String get clientRoleDenied => tr('Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.');
  static String get network => tr('Нет соединения. Проверьте интернет');
  static String get tooManyAttempts => tr('Слишком много попыток. Попробуйте позже');
  static String get serverUnavailable => tr('Сервис временно недоступен. Повторите позже');
  static String get wrongCurrentPassword => tr('Текущий пароль указан неверно');
  static String get deactivatedAccount => tr('Учётная запись деактивирована. Обратитесь к бригадиру.');

  /// `auth.md` §4.6: PIN ещё не задан на сервере (`ChangePinDto` без PIN).
  static String get pinNotSet => tr('PIN не установлен. Войдите по паролю и установите PIN.');

  /// `auth.md` п. 10.2: `POST /api/auth/change-pin` требует `currentPassword`
  /// под JWT — без активной сессии установить PIN нечем (отдельного эндпоинта
  /// «установить PIN без пароля» в auth-service нет).
  static String get pinSetupNeedsPassword => tr('Установить PIN можно только после входа по паролю: сервер требует текущий пароль (POST /api/auth/change-pin).');

  /// Ключ устройства не сохранён (кнопка биометрии в этом случае не рисуется).
  static String get biometricKeyMissing => tr('Биометрический ключ не сохранён на устройстве');
  static String get biometricNotRecognized => tr('Биометрический ключ не распознан');
  static String get biometricReason => tr('Войдите по отпечатку');
  static String get showPassword => tr('Показать пароль');
  static String get hidePassword => tr('Скрыть пароль');
  static String get splashCheck => tr('Проверка сессии…');
}
