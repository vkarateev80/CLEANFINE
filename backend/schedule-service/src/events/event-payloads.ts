import type { ScheduleFrequency } from '@cleaning-ops/shared/types/schedule';

/**
 * Payload'ы событий schedule-service.
 *
 * Контракт из shared/types/events.ts (ScheduleMissedCheckinEvent) требует
 * { userId, scheduleId, objectName }. Задача М4.5 дополнительно фиксирует
 * { scheduleId, eventId, userId, objectId, plannedStart }, поэтому payload —
 * аддитивное расширение: старые поля сохранены (notification-service читает их),
 * новые добавлены (e2e и админка используют id смены и объект).
 * Изменения контракта — только через review архитектора, здесь расширение без удаления.
 */
export interface ScheduleMissedCheckinPayload {
  userId: string;
  scheduleId: string;
  objectName: string;
  /** id смены (ScheduleEvent) — по нему админка открывает конкретную смену. */
  eventId: string;
  /** Объект смены; пустая строка, если у графика не задан objectId. */
  objectId: string;
  /** Плановое начало смены, ISO 8601. */
  plannedStart: string;
  /** Когда неявка зафиксирована сканером, ISO 8601. */
  detectedAt: string;
}

/**
 * Расписание повторения графика (хранится JSON-ом в Schedule.recurrence).
 * `frequency` — из shared-словаря: частоты задаёт админка, принимает DTO
 * (`@IsIn(FREQUENCIES)`) и обрабатывает генерация, поэтому значение одно на всех.
 */
export interface RecurrenceRule {
  frequency: ScheduleFrequency;
  /** Для weekly — дни недели (1=Пн … 7=Вс). Для daily/monthly игнорируется. */
  days?: number[];
  /**
   * Для monthly — число месяца (1..31). Контракт в задании задаёт только days,
   * поэтому поле необязательное: если оно не задано, для monthly берётся days[0].
   * Расширение аддитивное и не ломает существующие графики.
   */
  dayOfMonth?: number;
  /** Время начала смены "HH:mm" (UTC). */
  time: string;
}
