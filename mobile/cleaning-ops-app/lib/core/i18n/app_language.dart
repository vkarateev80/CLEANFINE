import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:intl/date_symbol_data_local.dart';

import 'translations.g.dart';

/// Языки интерфейса оператора (решение владельца 18.10.2026): русский —
/// исходный, кыргызский (кириллица) и узбекский (латиница, как в практикуме
/// RU–KY–UZ). Словарь общий с web-operator — `shared/i18n/*.json`.
enum AppLanguage {
  ru(code: 'ru', nativeName: 'Русский', short: 'RU'),
  ky(code: 'ky', nativeName: 'Кыргызча', short: 'KY'),
  uz(code: 'uz', nativeName: 'Oʻzbekcha', short: 'UZ');

  const AppLanguage({required this.code, required this.nativeName, required this.short});

  /// Код BCP-47 — он же ключ словаря и локаль `intl`.
  final String code;

  /// Название языка на нём самом — так подписан переключатель.
  final String nativeName;

  /// Короткая подпись сегмента («RU»).
  final String short;

  Locale get locale => Locale(code);

  static List<Locale> get supportedLocales =>
      values.map((AppLanguage language) => language.locale).toList(growable: false);

  static AppLanguage? fromCode(String? code) {
    if (code == null) return null;
    final String normalized = code.trim().toLowerCase().split(RegExp('[-_]')).first;
    for (final AppLanguage language in values) {
      if (language.code == normalized) return language;
    }
    return null;
  }

  /// Язык телефона, если он среди поддерживаемых; иначе русский.
  static AppLanguage fromDevice([Locale? locale]) =>
      fromCode((locale ?? PlatformDispatcher.instance.locale).languageCode) ?? ru;
}

/// Текущий язык и перевод строк. Глобальное состояние, а не `BuildContext`:
/// тексты лежат в статических классах (`ChatTexts` и т. п.) и в сообщениях
/// репозиториев, где контекста нет. Переключение языка пересобирает
/// `MaterialApp` (ключ по языку), поэтому все экраны перечитывают строки.
class AppI18n {
  const AppI18n._();

  static AppLanguage current = AppLanguage.ru;

  /// Перевод русской строки; нет перевода — та же строка. `args` подставляются
  /// в плейсхолдеры `{name}` после перевода.
  static String tr(String source, [Map<String, Object?>? args]) {
    String text = source;
    if (current != AppLanguage.ru) {
      text = kTranslations[current.code]?[source] ?? source;
    }
    if (args != null) {
      args.forEach((String key, Object? value) {
        text = text.replaceAll('{$key}', '$value');
      });
    }
    return text;
  }
}

/// `tr('Сегодня')` — перевод русской строки интерфейса на текущий язык.
String tr(String source) => AppI18n.tr(source);

/// `trArgs('Осталось {n}', {'n': 3})` — перевод с подстановкой плейсхолдеров.
String trArgs(String source, Map<String, Object?> args) => AppI18n.tr(source, args);

extension TrString on String {
  /// `'Сегодня'.tr`.
  String get tr => AppI18n.tr(this);
}

/// Данные `intl` (месяцы, дни недели) для всех языков интерфейса — вызывать
/// до `runApp`, иначе `DateFormat` на ky/uz бросит `LocaleDataException`.
Future<void> initializeAppDateFormatting() async {
  for (final AppLanguage language in AppLanguage.values) {
    await initializeDateFormatting(language.code);
  }
}
