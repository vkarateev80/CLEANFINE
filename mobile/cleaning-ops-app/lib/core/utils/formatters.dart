import 'package:intl/intl.dart';

import '../i18n/app_language.dart';

/// Форматирование дат и времени для экранов оператора — на языке интерфейса
/// (`AppI18n.current`): месяцы и дни недели берутся из `intl` для ru/ky/uz.
class Formatters {
  const Formatters._();

  static String get _locale => AppI18n.current.code;
  static DateFormat get _dateWithWeekday => DateFormat('E, d MMMM', _locale);
  static DateFormat get _time => DateFormat('HH:mm', _locale);
  static DateFormat get _dayMonth => DateFormat('d MMMM', _locale);

  /// «ср, 17 сентября» — дата над заголовком главного экрана.
  static String dateWithWeekday(DateTime date) => _dateWithWeekday.format(date);

  /// «17 сентября».
  static String dayMonth(DateTime date) => _dayMonth.format(date);

  /// «08:04» — время из ISO-строки; `null`, если строки нет или она битая.
  static String? time(String? isoString) {
    final DateTime? parsed = parseIso(isoString);
    return parsed == null ? null : _time.format(parsed);
  }

  /// «08:04–16:10» или «08:04–…», если смена ещё не закрыта.
  static String timeRange(String? fromIso, String? toIso) {
    final String from = time(fromIso) ?? '--:--';
    final String? to = time(toIso);
    return to == null ? '$from–…' : '$from–$to';
  }

  static DateTime? parseIso(String? value) {
    if (value == null || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  /// «02:14» — таймер операции (минуты:секунды, часы уходят в минуты).
  static String duration(Duration value) {
    final int minutes = value.inMinutes;
    final int seconds = value.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
