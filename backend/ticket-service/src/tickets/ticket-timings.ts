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
  existing: { acceptedAt?: Date | null; arrivedAt?: Date | null } = {},
): StatusTimingUpdate {
  switch (to) {
    case 'assigned':
      return {
        assignedAt: now,
        // Первое принятие фиксируем один раз: переоткрытие заявки не должно его терять.
        acceptedAt: existing.acceptedAt ?? now,
        reactionDeadline: null,
        arrivalDeadline: addMinutes(now, durations.acceptToArriveMin),
      };
    case 'in_progress':
      return {
        arrivedAt: existing.arrivedAt ?? now,
        completionDeadline: addMinutes(now, durations.arriveToDoneMin),
      };
    case 'completed':
      return { completedAt: now, completionDeadline: null };
    case 'verified':
      return { verifiedAt: now };
    case 'closed':
      return { closedAt: now, reactionDeadline: null, arrivalDeadline: null, completionDeadline: null };
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
