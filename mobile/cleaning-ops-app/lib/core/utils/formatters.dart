import 'package:intl/intl.dart';

/// Форматирование дат и времени для экранов оператора (локаль `ru`).
class Formatters {
  const Formatters._();

  static final DateFormat _dateWithWeekday = DateFormat('E, d MMMM', 'ru');
  static final DateFormat _time = DateFormat('HH:mm', 'ru');
  static final DateFormat _dayMonth = DateFormat('d MMMM', 'ru');

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
}
