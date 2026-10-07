import 'package:intl/intl.dart';

/// Форматирование KPI доски действий — калька веб-функций
/// (`reportsHelpers.ts`: formatMoney/formatPercent/formatMinutes/formatNumber),
/// чтобы цифры на маке и в браузере читались одинаково.

/// Стоимость: всегда два знака, группировка ru-RU (`1 234,50`).
String formatMoney(num value) => NumberFormat('#,##0.00', 'ru_RU').format(value);

/// Процент с одним знаком; `null` — «нет данных», а не 0 %.
String formatPercent(num? value) {
  if (value == null) return '—';
  return '${NumberFormat('0.#', 'ru_RU').format(value)} %';
}

/// Минуты в человекочитаемую длительность: `2 ч 30 мин`.
String formatMinutes(num? value) {
  if (value == null) return '—';
  final int total = value.round();
  if (total < 60) return '$total мин';
  final int hours = total ~/ 60;
  final int minutes = total % 60;
  return minutes == 0 ? '$hours ч' : '$hours ч $minutes мин';
}

/// Число с группировкой и до 3 знаков после запятой (`38`, `1 234,5`).
String formatNumber(num value) => NumberFormat('#,##0.###', 'ru_RU').format(value);
