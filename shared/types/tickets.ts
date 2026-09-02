/**
 * Заявки: типы, приоритеты, статусы и state machine.
 * Источник: УСТАВ.md → Агент Backend Tickets (п.1–2).
 * Вместо TS-enum используются константные массивы и union-типы
 * (решение архитектора, М0.7): проще для JS/TS-потребителей и Prisma.
 */

export const TICKET_TYPES = ['planned', 'unscheduled', 'emergency'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'paused',
  'completed',
  'verified',
  'rejected',
  'closed',
  'overdue',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Разрешённые переходы статусов (дословно из устава, Агент Backend Tickets). */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected', 'overdue'],
  in_progress: ['paused', 'completed', 'overdue'],
  paused: ['in_progress', 'overdue'],
  completed: ['verified', 'rejected'],
  verified: ['closed'],
  rejected: ['assigned', 'closed'],
  closed: [],
  overdue: ['in_progress', 'completed', 'closed'],
};

export const INVALID_TRANSITION_MESSAGE = 'Invalid status transition';

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
