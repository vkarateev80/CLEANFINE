import 'package:cleaning_ops_app/features/auth/presentation/pages/login_page.dart';
import 'package:cleaning_ops_app/features/auth/presentation/pages/pin_login_page.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/auth_providers.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// Приёмка М6.2 widget-тестами: тексты ошибок входа и правила PIN-клавиатуры
/// (те же сценарии перечислены в `design/screens/mobile/auth.md` §11).
void main() {
  Widget wrap(Widget page, {InMemorySecureStorage? storage, InMemoryPinStore? pins}) {
    return ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(storage ?? InMemorySecureStorage()),
        pinCredentialsProvider.overrideWithValue(pins ?? InMemoryPinStore()),
        authApiProvider.overrideWithValue(
          fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
        ),
      ],
      child: MaterialApp(home: page),
    );
  }

  testWidgets('пустой email показывает текст «Введите корректный email»', (tester) async {
    await tester.pumpWidget(wrap(const LoginPage()));
    await tester.pump();

    await tester.enterText(find.byKey(const Key('email_field')), '');
    await tester.ensureVisible(find.byKey(const Key('submit_button')));
    await tester.tap(find.byKey(const Key('submit_button')));
    await tester.pump();

    expect(find.text('Введите корректный email'), findsOneWidget);
  });

  testWidgets('кнопки биометрии нет, пока на устройстве не сохранён ключ', (tester) async {
    await tester.pumpWidget(wrap(const LoginPage()));
    await tester.pump();

    expect(find.byKey(const Key('login_biometric_button')), findsNothing);
    expect(find.byKey(const Key('login_pin_button')), findsOneWidget);
  });

  testWidgets('PIN-клавиатура: кнопка входа заблокирована до четырёх цифр', (tester) async {
    await tester.pumpWidget(wrap(const PinLoginPage()));
    await tester.pump();

    FilledButton submitButton() =>
        tester.widget<FilledButton>(find.byKey(const Key('pin_submit_button')));

    expect(submitButton().onPressed, isNull, reason: 'при пустом PIN вход невозможен');

    for (final String digit in <String>['3', '4', '5']) {
      await tester.ensureVisible(find.byKey(Key('pin_digit_$digit')));
      await tester.tap(find.byKey(Key('pin_digit_$digit')));
      await tester.pump();
    }
    expect(submitButton().onPressed, isNull, reason: 'три цифры — ещё рано');

    await tester.ensureVisible(find.byKey(const Key('pin_digit_6')));
    await tester.tap(find.byKey(const Key('pin_digit_6')));
    await tester.pump();

    expect(submitButton().onPressed, isNotNull, reason: 'четыре цифры — вход доступен');
  });

  testWidgets('PIN-клавиатура: кнопка удаления убирает последнюю цифру', (tester) async {
    await tester.pumpWidget(wrap(const PinLoginPage()));
    await tester.pump();

    for (final String digit in <String>['1', '2', '3', '4']) {
      await tester.ensureVisible(find.byKey(Key('pin_digit_$digit')));
      await tester.tap(find.byKey(Key('pin_digit_$digit')));
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(const Key('pin_delete_button')));
    await tester.tap(find.byKey(const Key('pin_delete_button')));
    await tester.pump();

    final FilledButton submitButton =
        tester.widget<FilledButton>(find.byKey(const Key('pin_submit_button')));
    expect(submitButton.onPressed, isNull, reason: 'после удаления осталось три цифры');
  });
}
