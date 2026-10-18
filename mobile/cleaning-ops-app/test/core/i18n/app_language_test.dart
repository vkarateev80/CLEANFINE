import 'dart:convert';
import 'dart:io';

import 'package:cleaning_ops_app/core/i18n/app_language.dart';
import 'package:cleaning_ops_app/core/i18n/translations.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// Переводы интерфейса (ru/ky/uz, решение владельца 18.10.2026).
void main() {
  tearDown(() => AppI18n.current = AppLanguage.ru);

  test('fromCode понимает коды с регионом и регистром, прочее — null', () {
    expect(AppLanguage.fromCode('ky'), AppLanguage.ky);
    expect(AppLanguage.fromCode('uz-UZ'), AppLanguage.uz);
    expect(AppLanguage.fromCode('RU_ru'), AppLanguage.ru);
    expect(AppLanguage.fromCode('en'), isNull);
    expect(AppLanguage.fromCode(null), isNull);
  });

  test('fromDevice: язык телефона среди поддерживаемых — он, иначе русский', () {
    expect(AppLanguage.fromDevice(const Locale('uz', 'UZ')), AppLanguage.uz);
    expect(AppLanguage.fromDevice(const Locale('en', 'US')), AppLanguage.ru);
  });

  test('tr: на русском возвращает исходник, без перевода — исходник, плейсхолдеры подставляются', () {
    expect(tr('Сегодня'), 'Сегодня');
    AppI18n.current = AppLanguage.ky;
    expect(tr('строки-которой-нет-в-словаре Ё'), 'строки-которой-нет-в-словаре Ё');
    expect(trArgs('Осталось {n} из {total}', <String, Object?>{'n': 2, 'total': 5}), 'Осталось 2 из 5');
    expect('Сегодня'.tr, kTranslations['ky']!['Сегодня'] ?? 'Сегодня');
  });

  test('translations.g.dart совпадает с shared/i18n/*.json (запустите scripts/i18n/sync.mjs)', () {
    for (final String lang in <String>['ky', 'uz']) {
      final File file = File('../../shared/i18n/$lang.json');
      expect(file.existsSync(), isTrue, reason: file.path);
      final Map<String, dynamic> json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final Map<String, String> expected = <String, String>{
        for (final MapEntry<String, dynamic> e in json.entries)
          if ((e.value as String).isNotEmpty) e.key: e.value as String,
      };
      expect(kTranslations[lang], equals(expected), reason: 'словарь $lang устарел');
    }
  });

  test('переводы не теряют плейсхолдеры исходника', () {
    final RegExp placeholder = RegExp(r'\{[a-zA-Z0-9_]+\}');
    for (final MapEntry<String, Map<String, String>> lang in kTranslations.entries) {
      for (final MapEntry<String, String> e in lang.value.entries) {
        final List<String> src = placeholder.allMatches(e.key).map((m) => m.group(0)!).toList()..sort();
        final List<String> dst = placeholder.allMatches(e.value).map((m) => m.group(0)!).toList()..sort();
        expect(dst, src, reason: '${lang.key}: «${e.key}» → «${e.value}»');
      }
    }
  });

  test('Material знает ky и uz — даты, диалоги и подсказки виджетов локализуются', () {
    for (final AppLanguage language in AppLanguage.values) {
      expect(GlobalMaterialLocalizations.delegate.isSupported(language.locale), isTrue, reason: language.code);
    }
  });
}
