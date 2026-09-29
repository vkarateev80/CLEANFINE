import { apiClient } from './client';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import type {
  CompleteOperationResult,
  CreateTicketPayload,
  EmergencyTicketPayload,
  EmergencyTicketResult,
  ListTicketsQuery,
  ListTicketsResult,
  TicketCommentEntity,
  TicketDetailEntity,
  TicketEntity,
} from '../types/tickets';

/**
 * Клиент ticket-service (:3005 через прокси `/api/tickets`). Как и `api/core`,
 * пути собраны в одном модуле: страницы не должны знать про `/tickets/:id/…`,
 * иначе путь размножится по компонентам и разойдётся с контроллером.
 */

export interface CreateCommentPayload {
  text: string;
}

export interface CompleteOperationPayload {
  /** ISO 8601; по умолчанию бэкенд ставит «сейчас». */
  completedAt?: string;
  /** Обязателен для операций с `requiresPhoto` — иначе 400. */
  photoUrl?: string;
  /** Сколько всего операций у заявки: по нему бэкенд определяет «все завершены». */
  totalOperations?: number;
}

/** Список заявок: `{ items, total }`, пагинация skip/take (take ≤ 100). */
export function listTickets(query: ListTicketsQuery = {}): Promise<ListTicketsResult> {
  return apiClient.get('/tickets', { params: query }).then((r) => r.data);
}

/** Деталь заявки: назначения, комментарии, завершённые операции. */
export function getTicket(id: string): Promise<TicketDetailEntity> {
  return apiClient.get(`/tickets/${id}`).then((r) => r.data);
}

/** Плановая/внеплановая заявка. `assigneeId` переводит её сразу в `assigned`. */
export function createTicket(payload: CreateTicketPayload): Promise<TicketEntity> {
  return apiClient.post('/tickets', payload).then((r) => r.data);
}

/** SOS: приоритет `critical` всегда, ответ содержит `nearbyOperators`. */
export function createEmergencyTicket(
  payload: EmergencyTicketPayload,
): Promise<EmergencyTicketResult> {
  return apiClient.post('/tickets/emergency', payload).then((r) => r.data);
}

/**
 * Смена статуса. Кнопки на экране строятся из `ALLOWED_TRANSITIONS`, поэтому
 * сюда попадают только валидные переходы; невалидный бэкенд отвергает 400
 * «Invalid status transition».
 */
export function changeTicketStatus(id: string, status: TicketStatus): Promise<TicketEntity> {
  return apiClient.patch(`/tickets/${id}/status`, { status }).then((r) => r.data);
}

/** Назначение исполнителя (ADMIN/SUPERVISOR): заявка переходит в `assigned`. */
export function assignTicket(id: string, assigneeId: string): Promise<TicketEntity> {
  return apiClient.post(`/tickets/${id}/assign`, { assigneeId }).then((r) => r.data);
}

export function addTicketComment(
  id: string,
  payload: CreateCommentPayload,
): Promise<TicketCommentEntity> {
  return apiClient.post(`/tickets/${id}/comments`, payload).then((r) => r.data);
}

/** Идемпотентно по operationId: повтор вернёт `alreadyCompleted: true`. */
export function completeTicketOperation(
  ticketId: string,
  operationId: string,
  payload: CompleteOperationPayload = {},
): Promise<CompleteOperationResult> {
  return apiClient
    .post(`/tickets/${ticketId}/operations/${operationId}/complete`, payload)
    .then((r) => r.data);
}
