import type { ScheduleEventStatus } from '@cleaning-ops/shared/types/schedule';

export {
  SCHEDULE_EVENT_STATUS_LABELS,
  SCHEDULE_EVENT_STATUSES,
} from '@cleaning-ops/shared/types/schedule';
export type { ScheduleEventStatus } from '@cleaning-ops/shared/types/schedule';

/**
 * Смена (`ScheduleEventView` schedule-service): ответ `/schedule/my`,
 * `/schedule/events/:id`, check-in/check-out. `objectName`/`routeName` сервер
 * подтягивает из core сам (null — core недоступен).
 */
export interface ScheduleEvent {
  id: string;
  scheduleId: string;
  scheduleName: string;
  objectId: string | null;
  routeId: string | null;
  objectName: string | null;
  routeName: string | null;
  /** День смены "YYYY-MM-DD" (полночь UTC). */
  date: string;
  plannedStart: string;
  plannedEnd: string;
  status: ScheduleEventStatus;
  userId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  /** Плановая заявка по смене — ключ для завершения операций чек-листа. */
  ticketId: string | null;
  checkOutReason: string | null;
}

export interface CheckInPayload {
  scheduleId: string;
  lat: number;
  lng: number;
}

export interface CheckOutPayload {
  scheduleId: string;
  lat?: number;
  lng?: number;
}
