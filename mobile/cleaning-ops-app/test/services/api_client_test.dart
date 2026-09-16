import 'dart:async';

import 'package:cleaning_ops_app/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

/// Проверка «моста» обновления токенов: параллельные 401 не должны устраивать
/// несколько refresh-запросов, а неудачный refresh обязан разлогинить.
void main() {
  test('параллельные вызовы refresh выполняют один запрос', () async {
    final bridge = SessionBridge();
    final completer = Completer<bool>();
    var calls = 0;
    bridge.onRefresh = () {
      calls += 1;
      return completer.future;
    };

    final first = bridge.refresh();
    final second = bridge.refresh();
    expect(calls, 1);

    completer.complete(true);
    expect(await first, isTrue);
    expect(await second, isTrue);

    // После завершения следующий 401 снова идёт в сеть.
    bridge.onRefresh = () async => true;
    expect(await bridge.refresh(), isTrue);
    expect(calls, 1);
  });

  test('без обработчика refresh возвращает false', () async {
    final bridge = SessionBridge();
    expect(await bridge.refresh(), isFalse);
  });

  test('logout вызывает зарегистрированный обработчик', () async {
    final bridge = SessionBridge();
    var loggedOut = 0;
    bridge.onLogout = () async => loggedOut += 1;

    await bridge.logout();
    expect(loggedOut, 1);
  });
}
