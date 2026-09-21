import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Widget-тест экрана поверх drift-базы.
///
/// Отличие от [testWidgets] — уборка внутри тела теста (см. [disposeScreen] и
/// [closeDatabase]). Это обязательно для экранов, которые слушают drift-поток
/// (`outgoingCountProvider` → `SyncStatusCounter` в `AppBar`):
///
/// 1. drift держит отменённый стрим-запрос в кэше до следующего `Timer.run`
///    (`StreamQueryStore.markAsClosed`), а `StreamQueryStore.close()` ждёт
///    completion этого таймера;
/// 2. flutter_test снимает дерево в конце тела теста, уже вне цикла `pump`,
///    поэтому таймер остаётся «pending» → падает проверка
///    `A Timer is still pending even after the widget tree was disposed`;
/// 3. `AppDatabase.close()` в `tearDown` после этого не завершается никогда:
///    продолжения drift-фьючеров выполняются микротасками fake-async зоны теста,
///    а вне тела теста эта очередь больше не дренится. Файл тестов зависает
///    целиком (изолят `flutter_tester` висит при нулевой загрузке CPU).
///
/// Поэтому дерево снимается и база закрывается здесь, пока тест идёт.
void screenTest(
  String description,
  Future<void> Function(WidgetTester tester) body, {
  AppDatabase? Function()? database,
}) {
  testWidgets(description, (WidgetTester tester) async {
    try {
      await body(tester);
    } finally {
      await disposeScreen(tester);
      final AppDatabase? testDatabase = database?.call();
      if (testDatabase != null) await closeDatabase(testDatabase);
    }
  });
}

/// Снять дерево виджетов и дать fake-async таймерам drift сработать.
///
/// Вызывать в конце тела теста (или через [screenTest]); после этого
/// [closeDatabase] безопасен.
Future<void> disposeScreen(WidgetTester tester) async {
  try {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  } on Object {
    // Дерево снять не удалось (например, тест упал внутри guarded-операции):
    // исходная ошибка теста важнее ошибки уборки.
  }
}

/// Закрыть drift-базу теста — только из тела теста (см. [screenTest]).
///
/// Перед закрытием дренится очередь fake-async зоны ([drainFakeAsync]): это
/// делает уборку независимой от порядка. Достаточно, чтобы drift-поток был
/// отписан (`container.dispose()` — в том числе из `UncontrolledProviderScope`
/// — и `ProviderScope` при снятии дерева); `markAsClosed` планирует `Timer.run`,
/// а `StreamQueryStore.close()` ждёт его completion. Дренаж гасит этот таймер
/// даже тогда, когда между отпиской и закрытием базы не было ни одного `pump`.
Future<void> closeDatabase(AppDatabase database) async {
  await drainFakeAsync();
  try {
    await database.close();
  } on Object {
    // База уже закрыта: не подменяем исходную ошибку теста ошибкой уборки.
  }
}

/// Дренировать очередь задач fake-async зоны: выполнить микротаски и сработать
/// таймерами с нулевой задержкой.
///
/// Widget-тест идёт в `FakeAsync`, и его часы двигает только `pump`. Между тем
/// отмена подписки на drift-поток планирует `Timer.run`
/// (`StreamQueryStore.markAsClosed`), а `StreamQueryStore.close()`
/// **синхронно** ждёт completion этого таймера (`while (_pendingTimers.isNotEmpty)
/// await _pendingTimers.first.future`). Если отписаться в конце теста и сразу
/// закрыть базу, таймер остаётся несработавшим: `database.close()` не
/// завершается никогда — изолят `flutter_tester` висит при нулевой загрузке CPU,
/// и это видно как `store.close waiting for timer` в отладчике drift.
///
/// `pump(Duration.zero)` двигает часы `FakeAsync` на минимальный шаг и потому
/// срабатывает такими таймерами (при `elapse` fake_async выполняет все таймеры
/// с дедлайном не позже новой точки). Дерево к этому моменту уже снято, поэтому
/// кадр ничего не перестраивает: задача — только прогнать очередь. В реальных
/// таймерах (`runAsync`) шаг безопасен и ничего не ждёт.
Future<void> drainFakeAsync() async {
  TestWidgetsFlutterBinding binding;
  try {
    binding = TestWidgetsFlutterBinding.ensureInitialized();
  } on Object {
    // Не тестовое окружение (например, скрипт) — дренировать нечего.
    return;
  }
  // Три кадра — с запасом на цепочку «таймер сработал → продолжение поставило
  // следующий» (у drift она ограничена одним звеном).
  for (int i = 0; i < 3; i++) {
    try {
      await binding.pump(Duration.zero);
    } on Object {
      // Кадр невозможен (тест уже завершился) — выходим, не мешая отчёту.
      return;
    }
  }
}
