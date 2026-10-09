import type { TicketPriority, TicketStatus, TicketType } from '@cleaning-ops/shared/types/tickets';

export type { TicketPriority, TicketStatus, TicketType } from '@cleaning-ops/shared/types/tickets';

/** Заявка (`Ticket` ticket-service), даты — ISO-строки. */
export interface TicketEntity {
  id: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  objectId: string;
  roomId: string | null;
  assigneeId: string | null;
  createdBy: string;
  description: string;
  lat: number | null;
  lng: number | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  overdueAt: string | null;
  reactionDeadline: string | null;
  arrivalDeadline: string | null;
  completionDeadline: string | null;
  operationsTotal: number | null;
  roomsTotal: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListItem extends TicketEntity {
  _count: { assignments: number; comments: number; operations: number };
}

export interface ListTicketsResult {
  items: TicketListItem[];
  total: number;
}

export interface TicketCommentEntity {
  id: string;
  ticketId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

/** Факт завершения операции (`ticket_operation_completions`); `roomId: ""` — без привязки. */
export interface TicketOperationCompletion {
  id: string;
  ticketId: string;
  operationId: string;
  roomId: string;
  completedAt: string;
  photoUrl: string | null;
  completedBy: string | null;
  createdAt: string;
}

/** `GET /api/tickets/:id`. */
export interface TicketDetail extends TicketEntity {
  assignments: Array<{ id: string; assigneeId: string; assignedBy: string; assignedAt: string }>;
  comments: TicketCommentEntity[];
  operations: TicketOperationCompletion[];
  operationsCompleted: number;
}

export interface CompleteOperationPayload {
  completedAt?: string;
  roomId?: string;
  photoUrl?: string;
  requiresPhoto?: boolean;
  totalOperations?: number;
}

export interface CompleteOperationResult {
  ticketId: string;
  operationId: string;
  roomId: string;
  objectId: string;
  completedAt: string;
  photoUrl: string | null;
  /** true — уже была отмечена (повтор после обрыва): это успех, не ошибка. */
  alreadyCompleted: boolean;
  completedOperations: number;
  operationsTotal: number | null;
  allOperationsCompleted: boolean;
}

export interface CompleteRoomPayload {
  completedAt?: string;
  totalRooms?: number;
}

export interface CompleteRoomResult {
  ticketId: string;
  roomId: string;
  completedAt: string;
  alreadyCompleted: boolean;
  completedRooms: number;
  roomsTotal: number | null;
  allRoomsCompleted: boolean;
}

export interface EmergencyTicketPayload {
  objectId: string;
  roomId?: string;
  description: string;
  lat: number;
  lng: number;
  objectName?: string;
  floor?: string;
  radiusM?: number;
}

export interface EmergencyTicketResult extends TicketEntity {
  nearbyOperators: Array<Record<string, unknown>>;
}

// ── Подписи (значения — из shared, подписи — свой домен, как в web-admin) ──

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  planned: 'Плановая',
  unscheduled: 'Внеплановая',
  emergency: 'Аварийная (SOS)',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  critical: 'Критичный',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Новая',
  assigned: 'Назначена',
  in_progress: 'В работе',
  paused: 'Приостановлена',
  completed: 'Выполнена',
  verified: 'Проверена',
  rejected: 'Отклонена',
  closed: 'Закрыта',
  overdue: 'Просрочена',
};

/** Закрытые заявки уходят в конец списка «Мои заявки» (home_today.md §3.4). */
export const CLOSED_TICKET_STATUSES: readonly TicketStatus[] = ['verified', 'closed', 'rejected'];

export function isClosedTicket(ticket: Pick<TicketEntity, 'status'>): boolean {
  return CLOSED_TICKET_STATUSES.includes(ticket.status);
}
