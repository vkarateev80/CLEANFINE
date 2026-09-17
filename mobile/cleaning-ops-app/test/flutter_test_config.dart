import 'dart:async';
import 'dart:ffi';
import 'dart:io';

import 'package:sqlite3/open.dart';

/// Хост-тесты drift нуждаются в нативной библиотеке sqlite3, при этом приложение
/// её не поставляет: в мобильной сборке библиотеку даёт `sqlite3_flutter_libs`, а
/// тестовый процесс запускается на хосте. Поэтому путь к библиотеке подбирается
/// здесь — иначе тесты падают с «Failed to load dynamic library».
///
/// - Windows: пакет ищет `sqlite3.dll`, которой рядом нет; система поставляет
///   свою сборку — `C:\Windows\System32\winsqlite3.dll`.
/// - Linux (CI): ищется `libsqlite3.so` — симлинк из `libsqlite3-dev`, которого на
///   раннере может не быть, зато есть рантайм `libsqlite3.so.0`.
///
/// Android, iOS и macOS не переопределяются: там библиотеку даёт платформа или
/// `sqlite3_flutter_libs`.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  } else if (Platform.isLinux) {
    open.overrideFor(OperatingSystem.linux, () => _openFirst(<String>[
          'libsqlite3.so',
          'libsqlite3.so.0',
        ]));
  }
  await testMain();
}

/// Первая библиотека из списка, которую удалось открыть.
DynamicLibrary _openFirst(List<String> names) {
  Object? lastError;
  for (final String name in names) {
    try {
      return DynamicLibrary.open(name);
    } on ArgumentError catch (error) {
      lastError = error;
    }
  }
  throw StateError('Не удалось загрузить sqlite3 для тестов: $lastError');
}
