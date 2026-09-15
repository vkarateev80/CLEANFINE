import { apiClient } from './client';
import type {
  CreateTicketPayload,
  ListTicketsQuery,
  ListTicketsResult,
  TicketCommentEntity,
  TicketDetailEntity,
  TicketEntity,
} from '../types/tickets';

/**
 * Клиент ticket-service (:3005 через прокси `/api/tickets`).
 *
 * В портале есть ровно две мутации заявки: создать обычную (`POST /tickets`) и
 * уточнить детали комментарием (`POST /tickets/:id/comments`). Смены статуса
 * (`PATCH /tickets/:id/status`) и назначения исполнителя (`POST /tickets/:id/assign`)
 * здесь нет намеренно: бэкенд разрешает их только ADMIN/SUPERVISOR/OPERATOR, а
 * клиенту такие кнопки не показываем вовсе — не «disabled», а отсутствие
 * (DS-004, `overview.md` п. 2).
 *
 * Аварийной заявки (`POST /tickets/emergency`) тоже нет: `EmergencyTicketPayload`
 * требует координат оператора на месте, а ложный SOS поднимает всех ближайших
 * исполнителей (design/screens/web-client/tickets.md п. 2.1).
 */

/** Список заявок объекта: `{ items, total }`, пагинация skip/take (`take` ≤ 100). */
export function listTickets(query: ListTicketsQuery = {}): Promise<ListTicketsResult> {
  return apiClient.get('/tickets', { params: query }).then((r) => r.data);
}

/** Деталь заявки: комментарии и завершённые операции (для таймлайна «ход работы»). */
export function getTicket(id: string): Promise<TicketDetailEntity> {
  return apiClient.get(`/tickets/${id}`).then((r) => r.data);
}

/**
 * Создание обычной (плановой/внеплановой) заявки. `priority` не отправляем:
 * это внутренняя договорённость диспетчера, в форме клиента его нет
 * (design/screens/web-client/tickets.md п. 2.1). `objectId` всегда приходит из
 * сессии, а не из формы.
 */
export function createTicket(payload: CreateTicketPayload): Promise<TicketEntity> {
  return apiClient.post('/tickets', payload).then((r) => r.data);
}

export function addTicketComment(id: string, text: string): Promise<TicketCommentEntity> {
  return apiClient.post(`/tickets/${id}/comments`, { text }).then((r) => r.data);
}
