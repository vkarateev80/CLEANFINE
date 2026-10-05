// М7.4 (перенос из М6.8) — измерение ФАКТИЧЕСКИХ интервалов отправки GPS-точек.
//
// Ограничение, зафиксированное в М6.6: плагина уровня батареи в стеке устава нет,
// поэтому `battery` в точках остаётся `null`, а фонового сервиса Android тоже нет.
// Значит, процент расхода батареи измерить НЕЧЕМ — и выдумывать его нельзя.
// Измеримо другое, и именно это здесь проверяется:
//   1. с какой частотой трекер реально просыпается и пишет точку (интервал
//      «в движении» 12 с против «статично» 60 с — `GpsTrackingConfig`, DS-002 §5.5);
//   2. сколько точек уходит на сервер и когда (батч-отправка);
//   3. как ведёт себя буфер при отсутствии сети (точки копятся и уходят позже);
//   4. что уходит в поле `battery` (ожидаемо `null` — доказательство ограничения).
//
// Тест держит приложение живым и печатает состояние трекера; координаты эмулятору
// подаёт хост-скрипт (`adb emu geo fix …`), а факт приёма точек проверяется по
// `GET /api/gps/tracks` — то есть измеряется не «что обещает код», а что произошло.
//
// Запуск: flutter test integration_test/gps_intervals_test.dart -d emulator-5554

import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integration_test/integration_test.dart';

import 'support/app_harness.dart';

const String kOperatorEmail = 'operator';
const String kOperatorPassword = 'oper123';

/// Сколько секунд держим приложение живым. Хост-скрипт подаёт координаты окнами.
///
/// 13 минут — вынужденная величина: на эмуляторе ПЕРВЫЙ фикс GPS приходит
/// примерно через 2 минуты после запроса (измерено пробой `probe_location_test`:
/// 110 с и 430 с в двух прогонах), а интервал «статично» — 60 с. Окно короче
/// 10 минут даёт одну-две точки, по которым интервал не измерить.
const int kTotalSeconds = int.fromEnvironment('GPS_SECONDS', defaultValue: 800);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('GPS: фактические интервалы отправки точек и поведение буфера', (
    WidgetTester tester,
  ) async {
    printDeviceHeader(tester, 'gps_intervals');
    final ProviderContainer container = await launchAppWithContainer(tester);

    final bool onLogin = await waitFor(
      tester,
      find.byKey(const Key('login_page')),
      timeout: const Duration(seconds: 30),
      what: 'экран входа',
    );
    expect(onLogin, isTrue);

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
    expect(onToday, isTrue);
    // Каркас с таб-баром запускает трекер (`AppShell.initState` → `start()`).
    await liveFor(tester, const Duration(seconds: 3));

    final DateTime started = DateTime.now();
    int tick = 0;
    while (DateTime.now().difference(started).inSeconds < kTotalSeconds) {
      tick++;
      // Состояние трекера — это состояние notifier-провайдера; буфер читаем из
      // drift напрямую (неотправленные точки `gps_points`).
      final GpsTrackingState state = container.read(gpsTrackerProvider);
      await container.read(gpsTrackerProvider.notifier).refresh();
      final int buffered =
          (await container.read(appDatabaseProvider).unsyncedGpsPoints()).length;
      // ignore: avoid_print
      print(
        'GPS t=${DateTime.now().difference(started).inSeconds}s '
        'tracking=${state.isTracking} access=${state.access?.isGranted} paused=${state.paused} '
        'interval=${state.interval.inSeconds}s speed=${state.lastSpeed?.toStringAsFixed(2) ?? 'null'} '
        'sent=${state.sent} buffered=$buffered error=${state.lastError ?? 'нет'}',
      );
      await liveFor(tester, const Duration(seconds: 15));
      if (tick > 60) break;
    }

    final GpsTrackingState finalState = container.read(gpsTrackerProvider);
    // ignore: avoid_print
    print('GPS_ИОГ итог: отправлено ${finalState.sent}, '
        'буфер ${finalState.buffered}, интервал ${finalState.interval.inSeconds}s, '
        'последняя скорость ${finalState.lastSpeed}');
    expect(finalState.access?.isGranted, isTrue, reason: 'нужно разрешение на геолокацию');
  });
}
