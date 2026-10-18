/**
 * Словарь расписания: статусы смены и частоты повторения графиков.
 * Источник значений — backend/schedule-service: `enum ScheduleEventStatus` в
 * `prisma/schema.prisma` и `FREQUENCIES` в `src/schedule/recurrence.ts`.
 *
 * Один словарь на три стороны (БД/бэкенд/админка): раньше значения были выписаны
 * и в prisma-схеме, и в recurrence.ts, и ещё раз в web-admin. Дрейф между копиями
 * ловится юнит-тестом schedule-service (`schedule-dictionary.spec.ts`), который
 * сравнивает множества значений из `@prisma/client` и этого модуля.
 */

/** Статусы смены: значения совпадают с `ScheduleEventStatus` в prisma-схеме. */
export const SCHEDULE_EVENT_STATUSES = ['PLANNED', 'CHECKED_IN', 'CHECKED_OUT', 'MISSED'] as const;

export type ScheduleEventStatus = (typeof SCHEDULE_EVENT_STATUSES)[number];

/**
 * Подписи статусов для бейджей и фильтров. `Record<ScheduleEventStatus, …>`
 * намеренно: новый статус в списке выше ломает компиляцию, а не показывается
 * пользователю сырым `CHECKED_IN`.
 */
export const SCHEDULE_EVENT_STATUS_LABELS: Record<ScheduleEventStatus, string> = {
  PLANNED: 'Запланирована',
  CHECKED_IN: 'Открыта',
  CHECKED_OUT: 'Закрыта',
  MISSED: 'Неявка',
};

/** Частоты повторения: значения совпадают с `FREQUENCIES` в recurrence.ts. */
export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** Подписи частот (тот же приём с `Record`, что и у статусов). */
export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: 'Ежедневно',
  weekly: 'По дням недели',
  monthly: 'Ежемесячно',
};

/**
 * Короткие подписи дней ISO (1 = Пн … 7 = Вс) — ключи те же, что у `recurrence.days`
 * в контракте графика, поэтому подпись нельзя случайно сдвинуть на «воскресенье —
 * первый день»: админка и мобильное приложение показывают дни одним словарём.
 */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
};

/**
 * Часовой пояс расписания (решение владельца 18.10.2026): время начала в графике,
 * день смены и все подписи времени — по Москве. UTC+3 круглый год: летнего
 * времени в России нет с 2014 года, поэтому хватает фиксированного сдвига без
 * базы часовых поясов. Сервер берёт то же значение по умолчанию
 * (`SCHEDULE_UTC_OFFSET_MINUTES` в configuration.ts schedule-service).
 */
export const SCHEDULE_UTC_OFFSET_MINUTES = 180;

/** Подпись пояса рядом со временем: «08:00 МСК». */
export const SCHEDULE_TIMEZONE_LABEL = 'МСК';

/** Момент, сдвинутый так, что его UTC-поля — московские «часы на стене». */
function toScheduleClock(value: Date): Date {
  return new Date(value.getTime() + SCHEDULE_UTC_OFFSET_MINUTES * 60_000);
}

/** День расписания `YYYY-MM-DD` (московский) для момента; по умолчанию — сегодня. */
export function scheduleDateOf(value: Date = new Date()): string {
  return toScheduleClock(value).toISOString().slice(0, 10);
}

/** `HH:mm` момента по времени расписания; пустая строка для нечитаемого значения. */
export function scheduleTimeOf(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return toScheduleClock(date).toISOString().slice(11, 16);
}

/** `dd.MM.yyyy` момента по времени расписания; пустая строка для нечитаемого значения. */
export function scheduleDayLabelOf(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const [year, month, day] = toScheduleClock(date).toISOString().slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}
