/// Валидация полей на клиенте: правила совпадают с DTO сервисов,
/// сообщения — русские и пригодны для `TextFormField.validator`.
///
/// Сообщения намеренно те же, что проверяют widget-тесты М6.2
/// (например, «Введите корректный email»).
class Validators {
  const Validators._();

  static final RegExp _phone = RegExp(r'^\+?[0-9\s-]{7,15}$');
  static final RegExp _pin = RegExp(r'^\d{4,6}$');

  /// Логин: `LoginDto.email` — email или короткое имя (admin, operator, client).
  /// Формат не ограничиваем (в отличие от прежнего `@IsEmail`): пустое — ошибка,
  /// остальное проверяет сервер (401), а не клиент.
  static String? email(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Введите корректный email';
    if (text.length > 254) return 'Введите корректный email';
    return null;
  }

  /// Пароль: `RegisterDto.password` — не короче 6 символов.
  static String? password(String? value) {
    final text = value ?? '';
    if (text.isEmpty) return 'Введите пароль';
    if (text.length < 6) return 'Пароль должен быть не короче 6 символов';
    return null;
  }

  /// PIN: `PinLoginDto.pinCode` / `ChangePinDto.newPin` — 4–6 цифр.
  static String? pin(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Введите PIN';
    if (!_pin.hasMatch(text)) return 'PIN должен содержать 4–6 цифр';
    return null;
  }

  /// Телефон: `RegisterDto.phone` (`^\+?[0-9\s-]{7,15}$`).
  static String? phone(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return null;
    if (!_phone.hasMatch(text)) return 'Некорректный телефон';
    return null;
  }

  /// ФИО: `RegisterDto.fullName` — обязательное поле.
  static String? fullName(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Укажите ФИО';
    return null;
  }

  /// Обязательное поле с собственным текстом ошибки.
  static String? required(String? value, {String message = 'Заполните поле'}) {
    final text = value?.trim() ?? '';
    return text.isEmpty ? message : null;
  }

  /// Описание аварийной заявки: сервер требует непустое описание SOS.
  static String? emergencyDescription(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Опишите аварию';
    if (text.length < 5) return 'Опишите аварию подробнее';
    return null;
  }
}
