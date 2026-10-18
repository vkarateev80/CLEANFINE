import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/service_providers.dart';
import 'app_language.dart';

/// Язык интерфейса: по умолчанию язык телефона, выбор оператора хранится в
/// secure storage и переживает выход из аккаунта.
final languageProvider = NotifierProvider<LanguageController, AppLanguage>(LanguageController.new);

class LanguageController extends Notifier<AppLanguage> {
  @override
  AppLanguage build() {
    final AppLanguage initial = AppLanguage.fromDevice();
    AppI18n.current = initial;
    return initial;
  }

  /// Читает сохранённый выбор (вызывается из корня приложения после первого кадра).
  Future<void> bootstrap() async {
    final String? saved = await ref.read(secureStorageProvider).readLanguage();
    final AppLanguage? language = AppLanguage.fromCode(saved);
    if (language != null && language != state) {
      AppI18n.current = language;
      state = language;
    }
  }

  Future<void> select(AppLanguage language) async {
    if (language == state) return;
    AppI18n.current = language;
    state = language;
    await ref.read(secureStorageProvider).saveLanguage(language.code);
  }
}
