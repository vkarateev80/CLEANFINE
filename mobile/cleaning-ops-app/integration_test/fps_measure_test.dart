// М7.4 (перенос из М6.8) — профилирование 60 FPS на карте маршрута и чек-листе.
//
// Методика (предпочтительный вариант из задания вехи): integration_test на
// ЭМУЛЯТОРЕ Android, реальное приложение, `SchedulerBinding.addTimingsCallback`
// собирает `FrameTiming` (build + raster). Порог приёмки — 95 % кадров укладываются
// в 16 мс (60 Гц).
//
// Что измеряется:
//   1. `карта маршрута` — панорамирование и «щипок» по плану этажа (6 с);
//   2. `чек-лист`       — прокрутка списка операций и переключение шагов (6 с);
//   3. `карта маршрута (загрузка)` и `чек-лист (загрузка)` — окна первого показа
//      (сеть + отрисовка), отдельно от интерактива: смешивать их нельзя, иначе
//      один сетевой кадр «съедает» весь бюджет выборки.
//
// Запуск (эмулятор co-test, стенд на 10.0.2.2):
//   flutter test integration_test/fps_measure_test.dart -d emulator-5554
//
// Подготовка окружения (делается хостом, а не тестом): на стенде создана геозона
// вокруг демо-объекта и смена оператора отмечена приходом — иначе главный экран не
// покажет кнопку маршрута. Подробности — docs/UAT_OPERATOR.md, раздел «Стенд».

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/app_harness.dart';
import 'support/frame_stats.dart';

const String kOperatorEmail = 'operator@cleaning-ops.com';
const String kOperatorPassword = 'oper123';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('60 FPS: карта маршрута и чек-лист', (WidgetTester tester) async {
    printDeviceHeader(tester, 'fps_measure');
    final FrameRecorder recorder = FrameRecorder();

    await launchApp(tester);

    // Вход по паролю (PIN на этом стенде может быть не настроен — это отдельный
    // шаг сценария оператора, к профилированию он отношения не имеет).
    final bool onLogin = await waitFor(
      tester,
      find.byKey(const Key('login_page')),
      timeout: const Duration(seconds: 30),
      what: 'экран входа',
    );
    expect(onLogin, isTrue, reason: 'приложение должно дойти до экрана входа');

    await tester.enterText(find.byKey(const Key('email_field')), kOperatorEmail);
    await tester.pump();
    await tester.enterText(find.byKey(const Key('password_field')), kOperatorPassword);
    await tester.pump();
    await tapKey(tester, 'submit_button');

    final bool onToday = await waitFor(
      tester,
      find.byKey(const Key('today_page')),
      timeout: const Duration(seconds: 40),
      what: 'главный экран /today',
    );
    expect(onToday, isTrue, reason: 'после входа должен открыться /today');

    // Кнопка маршрута появляется, когда смена отмечена приходом (подготовка — на стенде).
    final bool hasRoute = await waitFor(
      tester,
      find.byKey(const Key('today_route_button')),
      timeout: const Duration(seconds: 15),
      what: 'кнопка маршрута (смена отмечена приходом)',
    );

    if (!hasRoute) {
      final String body = tester
          .widget<Text>(find.byKey(const Key('today_empty_text')).evaluate().isNotEmpty
              ? find.byKey(const Key('today_empty_text'))
              : find.textContaining('смен').first)
          .data ??
          '';
      // ignore: avoid_print
      print('FPS_PRECONDITION смена не отмечена приходом: «$body»');
    }

    expect(hasRoute, isTrue, reason: 'нужна смена с отметкой прихода (см. подготовку стенда)');

    // ---------------------------------------------------------------
    // 1. Карта маршрута: загрузка и интерактив
    // ---------------------------------------------------------------
    recorder.begin('карта маршрута (загрузка)');
    await tapKey(tester, 'today_route_button');
    final bool onRoute = await waitFor(
      tester,
      find.byKey(const Key('route_map_page')),
      timeout: const Duration(seconds: 30),
      what: 'экран маршрута',
    );
    expect(onRoute, isTrue);
    await waitFor(
      tester,
      find.byKey(const Key('route_floor_plan_image')),
      timeout: const Duration(seconds: 25),
      what: 'план этажа на карте',
    );
    await recorder.end();

    final Finder plan = find.byKey(const Key('route_floor_plan_image'));
    // Диагностика: заглушка «План этажа недоступен» вместо картинки означает, что
    // адрес плана не дошёл до устройства (см. `ApiConstants.deviceUrl`).
    final bool placeholder =
        find.byKey(const Key('route_plan_placeholder')).evaluate().isNotEmpty;
    // ignore: avoid_print
    print('FPS_DIAG план этажа: картинка ${plan.evaluate().isNotEmpty}, заглушка $placeholder');
    if (plan.evaluate().isNotEmpty) {
      recorder.begin('карта маршрута (интерактив)');
      await dragMap(tester, plan, duration: const Duration(seconds: 6));
      await recorder.end();
    }

    // Точки маршрута в списке под картой — тоже интерактив.
    final Finder pointsList = find.byKey(const Key('route_points_list'));
    if (pointsList.evaluate().isNotEmpty) {
      recorder.begin('маршрут: список точек');
      await scrollWidget(tester, pointsList, duration: const Duration(seconds: 3));
      await recorder.end();
    }

    // ---------------------------------------------------------------
    // 2. Чек-лист: загрузка и интерактив
    // ---------------------------------------------------------------
    recorder.begin('чек-лист (загрузка)');
    final bool openedChecklist = await tapKey(tester, 'route_next_button');
    final bool onChecklist = openedChecklist
        ? await waitFor(
            tester,
            find.byKey(const Key('checklist_page')),
            timeout: const Duration(seconds: 30),
            what: 'экран чек-листа',
          )
        : false;
    if (onChecklist) {
      await waitFor(
        tester,
        find.byKey(const Key('checklist_operations_list')),
        timeout: const Duration(seconds: 25),
        what: 'список операций',
      );
    }
    await recorder.end();

    final Finder ops = find.byKey(const Key('checklist_operations_list'));
    if (onChecklist && ops.evaluate().isNotEmpty) {
      recorder.begin('чек-лист (интерактив)');
      await scrollWidget(tester, ops, duration: const Duration(seconds: 6));
      await recorder.end();
    }

    // ---------------------------------------------------------------
    // Отчёт
    // ---------------------------------------------------------------
    for (final String line in recorder.report()) {
      // ignore: avoid_print
      print(line);
    }
    // ignore: avoid_print
    print(recorder.json());

    expect(recorder.frameCount, greaterThan(0), reason: 'кадры должны быть собраны');
  });
}
