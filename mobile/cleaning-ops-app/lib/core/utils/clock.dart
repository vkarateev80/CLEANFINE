import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Источник «сейчас» для экранов с таймерами.
///
/// Таймер операции считается по wall-clock (`startedAtLocal` → сейчас), а не по
/// числу тиков `Timer.periodic`: так значение не «уплывает», если кадры
/// пропущены или приложение возвращалось из фона. В тестах часы подменяются,
/// чтобы проверять показания таймера детерминированно.
typedef Now = DateTime Function();

final nowProvider = Provider<Now>((Ref ref) => DateTime.now);

/// Сдвиг пояса расписания, мин: смены, их день и время графика — по Москве
/// (UTC+3, `SCHEDULE_UTC_OFFSET_MINUTES` в shared/types/schedule.ts, 18.10.2026).
const int kScheduleUtcOffsetMinutes = 180;

/// Момент по часам расписания: UTC-поля результата — московские «часы на стене».
DateTime scheduleClock(DateTime moment) =>
    moment.toUtc().add(const Duration(minutes: kScheduleUtcOffsetMinutes));
