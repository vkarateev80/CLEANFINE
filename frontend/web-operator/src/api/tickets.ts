import { apiClient } from './client';
import type {
  CompleteOperationPayload,
  CompleteOperationResult,
  CompleteRoomPayload,
  CompleteRoomResult,
  EmergencyTicketPayload,
  EmergencyTicketResult,
  ListTicketsResult,
  TicketCommentEntity,
  TicketDetail,
} from '../types/tickets';

/**
 * Клиент ticket-service. Оператор: читает свои заявки (`assigneeId` = он сам),
 * завершает операции и помещения по заявке смены, создаёт аварийную заявку.
 * Смена статуса заявки и назначение исполнителя — рабочее место бригадира.
 */
export function listMyTickets(
  assigneeId: string,
  { skip = 0, take = 20 }: { skip?: number; take?: number } = {},
): Promise<ListTicketsResult> {
  return apiClient.get('/tickets', { params: { assigneeId, skip, take } }).then((r) => r.data);
}

export function getTicket(id: string): Promise<TicketDetail> {
  return apiClient.get(`/tickets/${id}`).then((r) => r.data);
}

export function completeOperation(
  ticketId: string,
  operationId: string,
  payload: CompleteOperationPayload,
): Promise<CompleteOperationResult> {
  return apiClient
    .post(`/tickets/${ticketId}/operations/${operationId}/complete`, payload)
    .then((r) => r.data);
}

export function completeRoom(
  ticketId: string,
  roomId: string,
  payload: CompleteRoomPayload,
): Promise<CompleteRoomResult> {
  return apiClient
    .post(`/tickets/${ticketId}/rooms/${roomId}/complete`, payload)
    .then((r) => r.data);
}

export function createEmergency(payload: EmergencyTicketPayload): Promise<EmergencyTicketResult> {
  return apiClient.post('/tickets/emergency', payload).then((r) => r.data);
}

/** Комментарий к заявке — единственный «журнал» для пропуска точки (route_map.md п. 11.2). */
export function addTicketComment(ticketId: string, text: string): Promise<TicketCommentEntity> {
  return apiClient.post(`/tickets/${ticketId}/comments`, { text }).then((r) => r.data);
}
