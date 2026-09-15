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
export const SCHEDULE_EVENT_STATUSES = [
  'PLANNED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'MISSED',
] as const;

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
