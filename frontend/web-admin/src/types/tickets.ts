import type { TicketPriority, TicketStatus, TicketType } from '@cleaning-ops/shared/types/tickets';

/**
 * Типы ответов ticket-service (М3.7). Поля повторяют
 * `backend/ticket-service/prisma/schema.prisma`, но даты — строки: axios отдаёт
 * JSON, в котором `Date` уже сериализован в ISO 8601 (то же решение, что в
 * `src/types/core.ts`).
 *
 * Словари статусов/типов/приоритетов здесь НЕ дублируются: они приходят из
 * `@cleaning-ops/shared/types/tickets` (`TICKET_STATUSES`, `ALLOWED_TRANSITIONS`,
 * `canTransition`). Локализованные подписи — вспомогательные карты ниже, они
 * типизированы `Record<TicketStatus, string>`: добавится статус в shared —
 * компилятор потребует подпись, и экран не покажет сырое `in_progress`.
 */

/** Заявка (Ticket в Prisma). */
export interface TicketEntity {
  id: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  /** id объекта core-service (FK между сервисами нет). */
  objectId: string;
  roomId: string | null;
  /** id исполнителя auth-service; null — заявка ещё не назначена. */
  assigneeId: string | null;
  /** id автора (из JWT). */
  createdBy: string;
  description: string;
  /** Координаты аварийной/внеплановой заявки. */
  lat: number | null;
  lng: number | null;

  // ── тайминги жизненного цикла ───────────────────────────────────────────
  assignedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  overdueAt: string | null;

  // ── дедлайны эскалации (по ним работает сканер) ─────────────────────────
  reactionDeadline: string | null;
  arrivalDeadline: string | null;
  completionDeadline: string | null;
  /** Ожидаемое число операций техкарты (М3.6). */
  operationsTotal: number | null;

  createdAt: string;
  updatedAt: string;
}

/** Счётчики связей в списке: `include._count` (см. `TicketsService.list`). */
export interface TicketCounts {
  assignments: number;
  comments: number;
  operations: number;
}

/** Элемент `GET /api/tickets`: заявка + счётчики связей. */
export interface TicketListItem extends TicketEntity {
  _count: TicketCounts;
}

/** Строка истории назначений (`ticket_assignments`). */
export interface TicketAssignmentEntity {
  id: string;
  ticketId: string;
  assigneeId: string;
  /** Кто назначил (id из JWT). */
  assignedBy: string;
  assignedAt: string;
}

/** Комментарий к заявке (`ticket_comments`). */
export interface TicketCommentEntity {
  id: string;
  ticketId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

/** Факт завершения операции техкарты (`ticket_operation_completions`). */
export interface TicketOperationCompletionEntity {
  id: string;
  ticketId: string;
  operationId: string;
  completedAt: string;
  photoUrl: string | null;
  completedBy: string | null;
  createdAt: string;
}

/** `GET /api/tickets/:id`: заявка + история назначений, комментарии, операции. */
export interface TicketDetailEntity extends TicketEntity {
  assignments: TicketAssignmentEntity[];
  comments: TicketCommentEntity[];
  operations: TicketOperationCompletionEntity[];
  /** Удобное поле бэкенда: `ticket.operations.length`. */
  operationsCompleted: number;
}

/** Ответ SOS-эндпоинта: заявка + найденные gps-service операторы. */
export interface EmergencyTicketResult extends TicketEntity {
  nearbyOperators: Array<{ employeeId: string; distanceM?: number } & Record<string, unknown>>;
}

/** Ответ `POST /api/tickets/:id/operations/:operationId/complete` (М3.6). */
export interface CompleteOperationResult {
  ticketId: string;
  operationId: string;
  objectId: string;
  completedAt: string;
  photoUrl: string | null;
  /** true — операция уже была отмечена ранее (идемпотентность). */
  alreadyCompleted: boolean;
  completedOperations: number;
  operationsTotal: number | null;
  allOperationsCompleted: boolean;
}

// ── Запросы ────────────────────────────────────────────────────────────────

/** Типы, создаваемые обычным `POST /api/tickets`: аварийная — через `/emergency`. */
export const REGULAR_TICKET_TYPES = ['planned', 'unscheduled'] as const;
export type RegularTicketType = (typeof REGULAR_TICKET_TYPES)[number];

export interface CreateTicketPayload {
  type: RegularTicketType;
  priority?: TicketPriority;
  objectId: string;
  roomId?: string;
  /** Если задан, заявка создаётся сразу в статусе `assigned`. */
  assigneeId?: string;
  description: string;
  lat?: number;
  lng?: number;
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

/**
 * Фильтры `GET /api/tickets`. Пагинация — `skip`/`take` (соглашение сервисов,
 * см. `ListTicketsQueryDto`), а не `page`/`limit`: `take` на бэкенде ограничен 100.
 */
export interface ListTicketsQuery {
  skip?: number;
  take?: number;
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  objectId?: string;
  assigneeId?: string;
}

export interface ListTicketsResult {
  items: TicketListItem[];
  total: number;
}

// ── Подписи (свой домен, словари значений — из shared) ─────────────────────

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

/**
 * Названия действий для кнопок переходов. Ключ — целевой статус, поэтому набор
 * кнопок всегда строится из `ALLOWED_TRANSITIONS[текущий статус]` на экране.
 */
export const TICKET_TRANSITION_LABELS: Record<TicketStatus, string> = {
  new: 'Вернуть в «Новую»',
  assigned: 'Назначить',
  in_progress: 'Взять в работу',
  paused: 'Приостановить',
  completed: 'Выполнено',
  verified: 'Проверено',
  rejected: 'Отклонить',
  closed: 'Закрыть',
  overdue: 'Отметить просроченной',
};

/** Действие перехода требует подтверждения (необратимые/«отрицательные» шаги). */
export const TICKET_TRANSITION_CONFIRM: readonly TicketStatus[] = ['rejected', 'closed', 'overdue'];
