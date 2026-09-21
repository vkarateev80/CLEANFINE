// М7.4: сбор времён кадров на устройстве/эмуляторе.
//
// Зачем отдельный файл: одна и та же методика нужна и профилированию 60 FPS
// (`fps_measure_test.dart`), и приёмочному прогону оператора
// (`uat_operator_device_test.dart`). `SchedulerBinding.addTimingsCallback` отдаёт
// `FrameTiming` реального движка (не тестовые «кадры» fake-async), поэтому числа
// сопоставимы с DevTools timeline.
//
// Бюджет кадра — 16 мс на `build + raster`: при 60 Гц это и есть 60 FPS.
// Важно: `buildDuration` и `rasterDuration` — РАЗНЫЕ потоки (UI и raster), и
// складывать их можно только как «время в бюджете кадра» (порог из ПЛАН.md М6.8),
// а не как задержку одного кадра. Именно так и считаем — по требованию вехи.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/scheduler.dart';

/// Одно окно измерения: имя сценария и собранные кадры.
class FrameWindow {
  FrameWindow(this.label);

  final String label;
  final List<FrameTiming> frames = <FrameTiming>[];

  Map<String, dynamic> stats({double budgetMs = 16.0}) {
    if (frames.isEmpty) {
      return <String, dynamic>{
        'label': label,
        'frames': 0,
        'note': 'кадры не собраны',
      };
    }
    final List<double> build = frames.map((f) => f.buildDuration.inMicroseconds / 1000).toList()
      ..sort();
    final List<double> raster = frames.map((f) => f.rasterDuration.inMicroseconds / 1000).toList()
      ..sort();
    final List<double> total = frames
        .map((f) => (f.buildDuration + f.rasterDuration).inMicroseconds / 1000)
        .toList()
      ..sort();
    final List<double> span =
        frames.map((f) => f.totalSpan.inMicroseconds / 1000).toList()..sort();

    double percentile(List<double> sorted, double p) {
      if (sorted.isEmpty) return 0;
      final int index = ((sorted.length - 1) * p).round();
      return sorted[index];
    }

    final int inBudget = total.where((value) => value <= budgetMs).length;
    return <String, dynamic>{
      'label': label,
      'frames': frames.length,
      'budgetMs': budgetMs,
      'inBudget': inBudget,
      'inBudgetPercent': double.parse((inBudget * 100 / total.length).toStringAsFixed(2)),
      'buildAvgMs': _avg(build),
      'buildP50Ms': percentile(build, 0.50),
      'buildP95Ms': percentile(build, 0.95),
      'buildWorstMs': build.last,
      'rasterAvgMs': _avg(raster),
      'rasterP50Ms': percentile(raster, 0.50),
      'rasterP95Ms': percentile(raster, 0.95),
      'rasterWorstMs': raster.last,
      'totalAvgMs': _avg(total),
      'totalP95Ms': percentile(total, 0.95),
      'totalWorstMs': total.last,
      'spanP95Ms': percentile(span, 0.95),
      'missedFrames': total.length - inBudget,
    };
  }

  static double _avg(List<double> values) =>
      double.parse((values.reduce((a, b) => a + b) / values.length).toStringAsFixed(2));

  Map<String, dynamic> toJson() => stats();
}

/// Собирает `FrameTiming` в интервалы между [begin] и [end].
class FrameRecorder {
  final List<FrameWindow> windows = <FrameWindow>[];
  FrameWindow? _current;

  int get frameCount => windows.fold(0, (sum, window) => sum + window.frames.length);

  /// Начать окно измерения. Вложенные окна запрещены осознанно: иначе один и тот
  /// же кадр попал бы в две выборки и «доля в бюджете» стала бы неправдой.
  void begin(String label) {
    assert(_current == null, 'предыдущее окно измерения не закрыто: ${_current?.label}');
    _current = FrameWindow(label);
    SchedulerBinding.instance.addTimingsCallback(_collect);
  }

  /// Закрыть окно и дать движку дослать последние `FrameTiming`.
  Future<FrameWindow> end() async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    SchedulerBinding.instance.removeTimingsCallback(_collect);
    final FrameWindow window = _current!;
    _current = null;
    windows.add(window);
    return window;
  }

  void _collect(List<FrameTiming> timings) {
    _current?.frames.addAll(timings);
  }

  /// Отчёт по всем окнам: строка «KEY ...» на окно — так результат ищется в
  /// выводе `flutter test` без разбора JSON.
  List<String> report() {
    final List<String> lines = <String>[];
    for (final FrameWindow window in windows) {
      final Map<String, dynamic> stats = window.stats();
      if (stats['frames'] == 0) {
        lines.add('FPS ${window.label} — кадры не собраны');
        continue;
      }
      lines.add(
        'FPS ${window.label} | кадров ${stats['frames']} | '
        'в бюджете 16 мс ${stats['inBudget']} (${stats['inBudgetPercent']}%) | '
        'build avg ${stats['buildAvgMs']} p95 ${stats['buildP95Ms']} worst ${stats['buildWorstMs']} | '
        'raster avg ${stats['rasterAvgMs']} p95 ${stats['rasterP95Ms']} worst ${stats['rasterWorstMs']} | '
        'build+raster avg ${stats['totalAvgMs']} p95 ${stats['totalP95Ms']} worst ${stats['totalWorstMs']}',
      );
    }
    return lines;
  }

  /// Сводка в JSON — печатается целиком, чтобы результат можно было сохранить
  /// машинно, а не переписывать из лога.
  String json() {
    final List<Map<String, dynamic>> all = windows.map((w) => w.toJson()).toList();
    return 'FPS_JSON ${_encode(all)}';
  }

  static String _encode(List<Map<String, dynamic>> value) {
    final StringBuffer buffer = StringBuffer('[');
    for (int i = 0; i < value.length; i++) {
      if (i > 0) buffer.write(',');
      buffer.write('{');
      int index = 0;
      value[i].forEach((key, dynamic item) {
        if (index++ > 0) buffer.write(',');
        buffer.write('"$key":${item is String ? '"$item"' : item}');
      });
      buffer.write('}');
    }
    buffer.write(']');
    return buffer.toString();
  }
}

/// Простой счётчик «сколько кадров в секунду по факту» — второй, независимый
/// взгляд на то же окно: если движок рисовал реже 60 раз в секунду, это видно
/// и без анализа бюджета.
class FpsCounter {
  FpsCounter(this.windowMs);

  final int windowMs;
  final List<int> _stamps = <int>[];

  void tick() => _stamps.add(DateTime.now().millisecondsSinceEpoch);

  double get fps {
    if (_stamps.length < 2) return 0;
    final int span = _stamps.last - _stamps.first;
    if (span <= 0) return 0;
    return double.parse((( _stamps.length - 1) * 1000 / span).toStringAsFixed(1));
  }

  /// Медиана длительностей кадров — устойчивее среднего при разовых провалах.
  double get medianFrameMs {
    if (_stamps.length < 2) return 0;
    final List<int> deltas = <int>[];
    for (int i = 1; i < _stamps.length; i++) {
      deltas.add(_stamps[i] - _stamps[i - 1]);
    }
    deltas.sort();
    return deltas[deltas.length ~/ 2].toDouble();
  }

  /// Доля кадров, пришедших быстрее 16 мс (то есть движок успел в бюджет 60 Гц).
  double get shareWithinBudget {
    if (_stamps.length < 2) return 0;
    int fast = 0;
    int total = 0;
    for (int i = 1; i < _stamps.length; i++) {
      total++;
      if (_stamps[i] - _stamps[i - 1] <= 16) fast++;
    }
    return total == 0 ? 0 : double.parse((fast * 100 / total).toStringAsFixed(2));
  }

  static double get budgetMs => 16.0;

  /// Разброс: 95-й процентиль длительностей кадров.
  double get p95FrameMs {
    if (_stamps.length < 2) return 0;
    final List<int> deltas = <int>[];
    for (int i = 1; i < _stamps.length; i++) {
      deltas.add(_stamps[i] - _stamps[i - 1]);
    }
    deltas.sort();
    final int index = math.min(deltas.length - 1, ((deltas.length - 1) * 0.95).round());
    return deltas[index].toDouble();
  }
}
