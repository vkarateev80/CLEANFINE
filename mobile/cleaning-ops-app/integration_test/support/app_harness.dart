// М7.4: управление реальным приложением на устройстве из integration_test.

import 'dart:convert';
import 'dart:io';

import 'package:cleaning_ops_app/app.dart';
import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Запустить приложение так, как его запускает пользователь.
///
/// `initializeDateFormatting('ru')` обязателен: его делает `main()` приложения, а
/// тест поднимает корневой виджет сам. Без него русские даты на `/today` бросают
/// `LocaleDataException`, и главный экран не рисует карточку смены.
Future<void> launchApp(WidgetTester tester) async {
  await initializeDateFormatting('ru');
  await tester.pumpWidget(const ProviderScope(child: CleaningOpsApp()));
  await tester.pump();
  // Первый кадр + чтение сохранённой сессии из защищённого хранилища.
  await Future<void>.delayed(const Duration(milliseconds: 800));
  await tester.pump();
}

/// Запустить приложение с ЯВНЫМ контейнером Riverpod.
///
/// Нужен там, где тест обязан заглянуть внутрь приложения (например, снять
/// состояние GPS-трекера: выбранный интервал, отправленные и буферизованные
/// точки), а не только посмотреть на экран.
Future<ProviderContainer> launchAppWithContainer(WidgetTester tester) async {
  await initializeDateFormatting('ru');
  final ProviderContainer container = ProviderContainer();
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const CleaningOpsApp()),
  );
  await tester.pump();
  await Future<void>.delayed(const Duration(milliseconds: 800));
  await tester.pump();
  return container;
}

/// Дождаться появления виджета, «крутя» кадры (в live-binding нет pumpAndSettle
/// с fake-async, а периодические таймеры экранов не дают дереву «успокоиться»).
Future<bool> waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
  String what = 'виджет',
}) async {
  final DateTime deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return true;
  }
  // ignore: avoid_print
  print('WAIT_FAIL $what не появился за ${timeout.inSeconds} с');
  return false;
}

/// Доскроллить до виджета с ключом.
///
/// Экраны профиля и чатов — ленивые списки: виджета ниже видимой области в дереве
/// просто нет, поэтому `tapKey` по нему «не находит ключ». Оператор в такой ситуации
/// прокручивает экран — тест делает то же.
Future<bool> scrollToKey(
  WidgetTester tester,
  String key, {
  int attempts = 8,
  Duration settle = const Duration(milliseconds: 250),
  Finder? within,
}) async {
  if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
  final Finder scrollable = within == null
      ? find.byType(Scrollable)
      : find.descendant(of: within, matching: find.byType(Scrollable));
  if (scrollable.evaluate().isEmpty) return false;
  for (int i = 0; i < attempts; i++) {
    if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
    await tester.drag(scrollable.first, const Offset(0, -260), warnIfMissed: false);
    await tester.pump();
    await Future<void>.delayed(settle);
    await tester.pump();
    if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
  }
  return false;
}

/// Вернуться в каркас с таб-баром.
///
/// Таб-бар есть только у маршрутов `ShellRoute` («Сегодня», «Чаты», «Профиль»).
/// Маршрут смены, чек-лист и переписка открываются поверх него, а после ввода
/// текста ещё и поднимается клавиатура — кнопок таб-бара в дереве просто нет.
/// Оператор в жизни нажимает «назад»; тест делает то же.
Future<bool> returnToShell(WidgetTester tester, {int maxBack = 4}) async {
  for (int i = 0; i < maxBack; i++) {
    if (find.byKey(const Key('shell_tab_today')).evaluate().isNotEmpty) return true;
    if (find.byType(BackButton).evaluate().isEmpty &&
        find.byTooltip('Back').evaluate().isEmpty &&
        find.byType(AppBar).evaluate().isEmpty) {
      break;
    }
    await tester.pageBack();
    await tester.pump();
    await liveFor(tester, const Duration(seconds: 1));
  }
  return find.byKey(const Key('shell_tab_today')).evaluate().isNotEmpty;
}

/// Просто «пожить» указанное время: движок рисует кадры сам, тест их не форсирует.
Future<void> liveFor(WidgetTester tester, Duration duration) async {
  final DateTime deadline = DateTime.now().add(duration);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Найти виджеты, ключ которых начинается с префикса.
///
/// Часть ключей содержит идентификатор сущности (`checklist_op_start_button_<id>`):
/// в тесте он заранее неизвестен, а искать «хоть одну кнопку операции» — именно то,
/// что делает оператор.
Finder findByKeyPrefix(String prefix) {
  return find.byWidgetPredicate(
    (Widget widget) =>
        widget.key is ValueKey<String> &&
        (widget.key! as ValueKey<String>).value.startsWith(prefix),
  );
}

/// Нажать по ключу и подождать следующего кадра.
Future<bool> tapKey(WidgetTester tester, String key, {Duration settle = const Duration(milliseconds: 300)}) async {
  final Finder finder = find.byKey(Key(key));
  if (finder.evaluate().isEmpty) {
    // ignore: avoid_print
    print('TAP_FAIL нет виджета с ключом $key');
    return false;
  }
  await tester.ensureVisible(finder.first);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.tap(finder.first, warnIfMissed: false);
  await tester.pump();
  await Future<void>.delayed(settle);
  await tester.pump();
  return true;
}

/// Прокрутить список внутри виджета (жест «вверх-вниз»).
Future<void> scrollWidget(
  WidgetTester tester,
  Finder finder, {
  Duration duration = const Duration(seconds: 4),
}) async {
  final DateTime deadline = DateTime.now().add(duration);
  bool down = true;
  while (DateTime.now().isBefore(deadline)) {
    final Offset center = tester.getCenter(finder.first);
    final double dy = down ? -140 : 140;
    final TestGesture gesture = await tester.startGesture(center);
    for (int step = 0; step < 8; step++) {
      await gesture.moveBy(Offset(0, dy / 8));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await gesture.up();
    await tester.pump(const Duration(milliseconds: 16));
    down = !down;
  }
}

/// Перетаскивание и «щипок» по карте: то же, что делает оператор пальцами.
Future<void> dragMap(
  WidgetTester tester,
  Finder finder, {
  Duration duration = const Duration(seconds: 6),
}) async {
  final DateTime deadline = DateTime.now().add(duration);
  final Offset center = tester.getCenter(finder.first);
  int round = 0;
  while (DateTime.now().isBefore(deadline)) {
    if (round.isEven) {
      // Панорама: движение в четыре стороны.
      for (final Offset delta in <Offset>[
        const Offset(60, 0),
        const Offset(0, 60),
        const Offset(-60, 0),
        const Offset(0, -60),
      ]) {
        final TestGesture gesture = await tester.startGesture(center);
        for (int step = 0; step < 6; step++) {
          await gesture.moveBy(delta / 6);
          await tester.pump(const Duration(milliseconds: 16));
        }
        await gesture.up();
        await tester.pump(const Duration(milliseconds: 16));
      }
    } else {
      // Масштаб: два пальца расходятся и сходятся.
      final TestGesture first = await tester.startGesture(center - const Offset(30, 0));
      final TestGesture second = await tester.startGesture(center + const Offset(30, 0));
      for (int step = 0; step < 8; step++) {
        await first.moveBy(const Offset(-8, 0));
        await second.moveBy(const Offset(8, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      for (int step = 0; step < 8; step++) {
        await first.moveBy(const Offset(8, 0));
        await second.moveBy(const Offset(-8, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await first.up();
      await second.up();
      await tester.pump(const Duration(milliseconds: 16));
    }
    round++;
  }
}

// ---------------------------------------------------------------------------
// Прямые вызовы API стенда из теста: подготовка данных, которую в UAT делает
// макет окружения (геозона, отметка прихода), а не пользователь.
// ---------------------------------------------------------------------------

class StandApi {
  StandApi(this.email, this.password);

  final String email;
  final String password;
  String? _token;

  Future<String> token() async {
    if (_token != null) return _token!;
    final Map<String, dynamic> body = await _request(
      'POST',
      '${ApiConstants.authBaseUrl}/api/auth/login',
      body: <String, String>{'email': email, 'password': password},
    );
    _token = body['accessToken'] as String;
    return _token!;
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String url, {
    Map<String, dynamic>? body,
    String? bearer,
  }) async {
    final HttpClient client = HttpClient();
    try {
      final HttpClientRequest request =
          await (method == 'POST' ? client.postUrl(Uri.parse(url)) : client.getUrl(Uri.parse(url)));
      request.headers.contentType = ContentType.json;
      if (bearer != null) request.headers.set('Authorization', 'Bearer $bearer');
      if (body != null) request.write(jsonEncode(body));
      final HttpClientResponse response = await request.close();
      final String text = await response.transform(utf8.decoder).join();
      if (text.isEmpty) return <String, dynamic>{'status': response.statusCode};
      final dynamic decoded = jsonDecode(text);
      if (decoded is Map<String, dynamic>) {
        return <String, dynamic>{'status': response.statusCode, ...decoded};
      }
      return <String, dynamic>{'status': response.statusCode, 'items': decoded};
    } finally {
      client.close(force: true);
    }
  }

  Future<Map<String, dynamic>> get(String path) async =>
      _request('GET', '${ApiConstants.coreBaseUrl}$path', bearer: await token());

  Future<Map<String, dynamic>> apiGet(String base, String path) async =>
      _request('GET', '$base$path', bearer: await token());

  Future<Map<String, dynamic>> apiPost(String base, String path, Map<String, dynamic> body) async =>
      _request('POST', '$base$path', body: body, bearer: await token());
}

/// Общий заголовок отчёта прогона на устройстве.
///
/// Размер экрана берётся из `tester.view` (не из устаревшего `window`): именно
/// этот viewport видит движок, и именно он определяет площадь растеризации —
/// без него числа FPS нельзя сопоставить с конфигурацией эмулятора.
void printDeviceHeader(WidgetTester tester, String name) {
  final Size physical = tester.view.physicalSize;
  final double ratio = tester.view.devicePixelRatio;
  // ignore: avoid_print
  print('DEVICE_RUN $name | экран ${physical.width.toInt()}×${physical.height.toInt()} '
      '@ ${ratio}x (логически ${(physical.width / ratio).round()}×'
      '${(physical.height / ratio).round()})');
}
