import type { ScheduleEventStatus, ScheduleFrequency } from '@cleaning-ops/shared/types/schedule';

/**
 * Типы ответов schedule-service (М4.6). Поля повторяют
 * `backend/schedule-service/prisma/schema.prisma` и вьюхи `ScheduleEventView` /
 * `GenerationResult` / `MissedScanResult` из `schedule.service.ts`, но даты —
 * строки: axios отдаёт JSON, в котором `Date` уже сериализован в ISO 8601 (то же
 * решение, что в `src/types/core.ts`, `tickets.ts` и `materials.ts`).
 *
 * Словарь статусов смены, частот и дней недели НЕ дублируется:
 * `SCHEDULE_EVENT_STATUSES`, `SCHEDULE_EVENT_STATUS_LABELS`, `SCHEDULE_FREQUENCIES`,
 * `SCHEDULE_FREQUENCY_LABELS` и `WEEKDAY_LABELS` живут в
 * `@cleaning-ops/shared/types/schedule` — оттуда их берёт и schedule-service
 * (значения статусов закреплены prisma-схемой и сверяются юнит-тестом сервиса),
 * поэтому подписи в админке не могут разойтись с тем, что отдаёт API. Здесь они
 * только реэкспортируются, чтобы экраны импортировали домен из одного места.
 */

export {
  SCHEDULE_EVENT_STATUSES,
  SCHEDULE_EVENT_STATUS_LABELS,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
  SCHEDULE_TIMEZONE_LABEL,
  WEEKDAY_LABELS,
  scheduleDateOf,
  scheduleDayLabelOf,
  scheduleTimeOf,
} from '@cleaning-ops/shared/types/schedule';
export type { ScheduleEventStatus, ScheduleFrequency } from '@cleaning-ops/shared/types/schedule';

// ── Графики ────────────────────────────────────────────────────────────────

/**
 * Правило повторения (`RecurrenceDto`). `days` — ISO-дни: 1 = понедельник …
 * 7 = воскресенье; `time` — "HH:mm" по Москве (пояс расписания с 18.10.2026,
 * `SCHEDULE_UTC_OFFSET_MINUTES` в shared): в форме и таблицах время вводится и
 * показывается как есть, с подписью «МСК».
 */
export interface ScheduleRecurrence {
  frequency: ScheduleFrequency;
  days?: number[];
  dayOfMonth?: number;
  time: string;
}

/** График (`Schedule` в Prisma + `eventsCount` из `ScheduleService.list`). */
export interface ScheduleEntity {
  id: string;
  objectId: string | null;
  routeId: string | null;
  name: string;
  recurrence: ScheduleRecurrence;
  /** id исполнителей auth-service: по смене на каждого. */
  assignees: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  eventsCount: number;
}

/**
 * Смена в плоском виде (`ScheduleEventView`) — ответ `/events`, `/events/:id`
 * и `/my`. `userId` бывает `null`: график без исполнителя порождает смену без
 * назначенного человека.
 */
export interface ScheduleEventEntity {
  id: string;
  scheduleId: string;
  /** Имя графика: мобильному и админке нужен заголовок без второго запроса. */
  scheduleName: string;
  objectId: string | null;
  routeId: string | null;
  /** Имя объекта/маршрута из core (null — core недоступен). */
  objectName: string | null;
  routeName: string | null;
  /** День смены "YYYY-MM-DD" (полночь UTC). */
  date: string;
  /** Плановое начало: ISO 8601 UTC (день + `recurrence.time`). */
  plannedStart: string;
  /** Плановый конец: `plannedStart` + durationMin (или 8 ч по умолчанию). */
  plannedEnd: string | null;
  status: ScheduleEventStatus;
  userId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  /** Плановая заявка ticket-service, созданная по этой смене (М4.4). */
  ticketId: string | null;
  checkOutReason: string | null;
}

// ── Сводки ручных триггеров ────────────────────────────────────────────────

/** Ответ `POST /api/schedule/generate` (`GenerationResult`). */
export interface GenerationResult {
  date: string;
  schedulesMatched: number;
  shiftsCreated: number;
  /** Смены, которые уже были: идемпотентность по `@@unique(scheduleId, date, userId)`. */
  shiftsSkipped: number;
  ticketsCreated: number;
  ticketsFailed: number;
  ticketsBackfilled: number;
  /** true — ticket-service недоступен, проход прерван до записи смен (502). */
  ticketServiceUnavailable: boolean;
  errors: string[];
}

/** Ответ `POST /api/schedule/check-missed` (`MissedScanResult` + `AutoCheckoutResult`). */
export interface MissedScanResult {
  missed: {
    /** Сколько смен-кандидатов проверено. */
    scanned: number;
    missed: number;
    eventIds: string[];
  };
  autoCheckout: {
    closed: number;
    eventIds: string[];
  };
}

/** Ответ `GET /api/schedule/scheduler/state` (`SweepState`). */
export interface SchedulerState {
  lastGenerateAt: string | null;
  lastScanAt: string | null;
  lastGenerateDate: string | null;
}

// ── Запросы ────────────────────────────────────────────────────────────────

/** Фильтры `GET /api/schedule/events`. Дата — "YYYY-MM-DD" (без сдвигов `Date`). */
export interface ListEventsQuery {
  date?: string;
  objectId?: string;
  userId?: string;
}

/** Фильтры `GET /api/schedule/my`: период `from`/`to` включительно, "YYYY-MM-DD". */
export interface MyEventsQuery {
  from?: string;
  to?: string;
}

/**
 * `POST /api/schedule` (`CreateScheduleDto`). `objectId`/`routeId` необязательны:
 * график может быть привязан только к маршруту или вообще ни к чему (тогда
 * смены генерируются, а плановые заявки не создаются — нет объекта).
 */
export interface CreateSchedulePayload {
  objectId?: string;
  routeId?: string;
  name: string;
  recurrence: ScheduleRecurrence;
  /** Непустой список — требование `@ArrayNotEmpty` в DTO. */
  assignees: string[];
  isActive?: boolean;
}

/** `PATCH /api/schedule/:id`: все поля необязательны, отсутствие — «не менять». */
export type UpdateSchedulePayload = Partial<Omit<CreateSchedulePayload, 'objectId'>> & {
  /**
   * `null` снимает привязку к объекту: в `UpdateScheduleDto` `objectId` объявлен
   * `@IsOptional() @IsString()`, то есть `null` — единственный способ очистить поле
   * (отсутствие поля означает «не менять»). Ровно то же решение, что `supplier: null`
   * в material-service.
   */
  objectId?: string | null;
};

/** `POST /api/schedule/check-in`: график и координаты обязательны. */
export interface CheckInPayload {
  scheduleId: string;
  lat: number;
  lng: number;
}

/** `POST /api/schedule/check-out`: координаты необязательны. */
export interface CheckOutPayload {
  scheduleId: string;
  lat?: number;
  lng?: number;
}

/** Ответ `DELETE /api/schedule/:id`. */
export interface DeleteScheduleResult {
  id: string;
  deleted: true;
  /** Сколько смен удалено каскадом вместе с графиком. */
  eventsDeleted: number;
}
