import 'package:cleaning_ops_app/core/i18n/app_language.dart';
import 'package:cleaning_ops_app/core/i18n/language_picker.dart';
import 'package:cleaning_ops_app/core/i18n/language_provider.dart';
import 'package:cleaning_ops_app/features/auth/auth_texts.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Переключатель языка: выбор переводит тексты и сохраняется в хранилище.
void main() {
  tearDown(() => AppI18n.current = AppLanguage.ru);

  testWidgets('сегменты RU · KY · UZ меняют язык, строки переводятся, выбор сохраняется', (tester) async {
    final _MemoryStorage storage = _MemoryStorage();
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[secureStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: Consumer(
          builder: (context, ref, _) {
            final AppLanguage language = ref.watch(languageProvider);
            return MaterialApp(
              key: ValueKey<String>(language.code),
              home: Scaffold(
                body: Column(
                  children: <Widget>[
                    const LanguageSegments(),
                    Text(AuthTexts.signIn, key: const Key('probe')),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
    expect(find.text('Войти'), findsOneWidget);

    await tester.tap(find.byKey(const Key('language_segment_ky')));
    await tester.pumpAndSettle();
    expect(find.text('Кирүү'), findsOneWidget);
    expect(await storage.readLanguage(), 'ky');

    await tester.tap(find.byKey(const Key('language_segment_uz')));
    await tester.pumpAndSettle();
    expect(find.text('Kirish'), findsOneWidget);
    expect(AppI18n.current, AppLanguage.uz);

    await tester.tap(find.byKey(const Key('language_segment_ru')));
    await tester.pumpAndSettle();
    expect(find.text('Войти'), findsOneWidget);
  });

  test('bootstrap читает сохранённый язык', () async {
    final _MemoryStorage storage = _MemoryStorage()..saved = 'uz';
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[secureStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);
    expect(container.read(languageProvider), AppLanguage.ru);
    await container.read(languageProvider.notifier).bootstrap();
    expect(container.read(languageProvider), AppLanguage.uz);
    expect(tr('Сегодня'), 'Bugun');
  });
}

class _MemoryStorage extends SecureStorageService {
  String? saved;

  @override
  Future<String?> readLanguage() async => saved;

  @override
  Future<void> saveLanguage(String code) async => saved = code;
}
