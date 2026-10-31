import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';

/** Длительности таймеров эскалации (М3.5) — из env, в тестах сокращаются. */
export interface EscalationDurations {
  /** NEW → принята (назначен исполнитель). */
  newToAcceptMin: number;
  /** принята → прибытие на объект. */
  acceptToArriveMin: number;
  /** прибытие → выполнение. */
  arriveToDoneMin: number;
}

export const MINUTE_MS = 60_000;

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** Полных минут между моментами; отрицательное значение (запас времени) → 0. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE_MS));
}

/** Дедлайн реакции: created + ESCALATION_NEW_TO_ACCEPT_MIN. */
export function reactionDeadline(createdAt: Date, durations: EscalationDurations): Date {
  return addMinutes(createdAt, durations.newToAcceptMin);
}

/**
 * Конец смены как дедлайн выполнения, пока он впереди (22.10.2026). Если смена уже
 * прошла (overdue → in_progress), действуют обычные 60 минут — иначе заявка уходила
 * бы в overdue снова сразу после возобновления.
 */
export function shiftDeadline(plannedEnd: Date | null | undefined, now: Date): Date | null {
  return plannedEnd && plannedEnd.getTime() > now.getTime() ? plannedEnd : null;
}

/** Поля-тайминги, которые проставляет переход статуса. null — очистить дедлайн. */
export interface StatusTimingUpdate {
  assignedAt?: Date;
  acceptedAt?: Date;
  arrivedAt?: Date;
  completedAt?: Date;
  verifiedAt?: Date;
  closedAt?: Date;
  overdueAt?: Date;
  reactionDeadline?: Date | null;
  arrivalDeadline?: Date | null;
  completionDeadline?: Date | null;
}

/**
 * Что записать в заявку при переходе в статус `to` (М3.4 «проставляет тайминги»
 * + М3.5 «дедлайны для эскалации»).
 *
 * Логика дедлайнов:
 *  - new → assigned («принята»): время реакции соблюдено → reactionDeadline гасится,
 *    взводится arrivalDeadline (прибытие);
 *  - → in_progress («прибыл»): взводится completionDeadline (выполнение);
 *  - → overdue: заявка уже просрочена → дедлайны гасятся, чтобы сканер не сработал повторно;
 *  - → closed: терминальный статус, таймеров нет.
 */
export function timingUpdatesFor(
  to: TicketStatus,
  now: Date,
  durations: EscalationDurations,
  existing: { acceptedAt?: Date | null; arrivedAt?: Date | null; plannedEnd?: Date | null } = {},
): StatusTimingUpdate {
  switch (to) {
    case 'assigned':
      return {
        assignedAt: now,
        // Первое принятие фиксируем один раз: переоткрытие заявки не должно его терять.
        acceptedAt: existing.acceptedAt ?? now,
        reactionDeadline: null,
        // Заявка смены: срок — конец смены (стоит с создания), таймер прибытия не нужен —
        // неявку на смену ловит schedule-service.
        arrivalDeadline: existing.plannedEnd
          ? null
          : addMinutes(now, durations.acceptToArriveMin),
      };
    case 'in_progress':
      return {
        arrivedAt: existing.arrivedAt ?? now,
        completionDeadline:
          shiftDeadline(existing.plannedEnd, now) ?? addMinutes(now, durations.arriveToDoneMin),
      };
    case 'completed':
      return { completedAt: now, completionDeadline: null };
    case 'verified':
      return { verifiedAt: now };
    case 'closed':
      return {
        closedAt: now,
        reactionDeadline: null,
        arrivalDeadline: null,
        completionDeadline: null,
      };
    case 'overdue':
      return {
        overdueAt: now,
        reactionDeadline: null,
        arrivalDeadline: null,
        completionDeadline: null,
      };
    default:
      // paused и rejected: тайминги не меняются. Пауза не отменяет дедлайн выполнения
      // (paused → overdue разрешён state machine), а отклонённая заявка не сканируется —
      // при повторном назначении arrivalDeadline взведётся заново.
      return {};
  }
}

/** Поля-тайминги ручной смены статуса: здесь отметка шага может и очищаться. */
export type StatusOverrideUpdate = {
  [K in keyof StatusTimingUpdate]: Date | null;
} & { escalatedAt?: Date | null };

/** Что знает заявка на момент ручной смены статуса. */
export interface StatusOverrideSource {
  acceptedAt: Date | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  escalatedAt: Date | null;
  plannedEnd: Date | null;
}

/**
 * Что записать в заявку, когда администратор выставляет статус вручную, в обход
 * state machine (01.11.2026). В отличие от `timingUpdatesFor` статус идёт и назад,
 * поэтому отметки шагов, которых теперь «не было», очищаются: отчёты считают цикл по
 * `completedAt`, просрочку — по `overdueAt`, а сканер эскалации — по дедлайнам.
 * Уже случившиеся факты (когда выполнена, когда проверена) при этом не переписываются.
 */
export function statusOverrideUpdates(
  to: TicketStatus,
  now: Date,
  durations: EscalationDurations,
  existing: StatusOverrideSource,
): StatusOverrideUpdate {
  const noDeadlines = { reactionDeadline: null, arrivalDeadline: null, completionDeadline: null };
  const notFinished = { completedAt: null, verifiedAt: null, closedAt: null, overdueAt: null };
  switch (to) {
    case 'new':
      return {
        ...notFinished,
        ...noDeadlines,
        assignedAt: null,
        acceptedAt: null,
        arrivedAt: null,
        // Сканер отбирает новые заявки по createdAt: старая заявка, возвращённая в
        // «Новую», без этой отметки сразу разослала бы всем эскалацию.
        escalatedAt: existing.escalatedAt ?? now,
      };
    case 'assigned':
      return {
        ...notFinished,
        ...noDeadlines,
        arrivedAt: null,
        // Заявка смены: срок — конец смены, пока он впереди.
        completionDeadline: shiftDeadline(existing.plannedEnd, now),
        ...timingUpdatesFor('assigned', now, durations, existing),
      };
    case 'in_progress':
      return {
        ...notFinished,
        ...noDeadlines,
        ...timingUpdatesFor('in_progress', now, durations, existing),
      };
    case 'paused':
      // Дедлайн выполнения пауза не трогает — как и обычный переход.
      return {
        ...notFinished,
        reactionDeadline: null,
        arrivalDeadline: null,
        arrivedAt: existing.arrivedAt ?? now,
      };
    case 'completed':
      return { ...notFinished, ...noDeadlines, completedAt: existing.completedAt ?? now };
    case 'verified':
      return {
        ...notFinished,
        ...noDeadlines,
        completedAt: existing.completedAt ?? now,
        verifiedAt: existing.verifiedAt ?? now,
      };
    case 'closed':
      return timingUpdatesFor('closed', now, durations);
    case 'rejected':
      return { ...notFinished, ...noDeadlines };
    case 'overdue':
      return { ...notFinished, ...timingUpdatesFor('overdue', now, durations) };
  }
}
