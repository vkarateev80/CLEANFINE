import type { TicketPriority, TicketStatus, TicketType } from '@cleaning-ops/shared/types/tickets';
import type { TicketEntity, UpdateTicketPayload } from '../../types/tickets';

/**
 * Логика формы правки заявки (только ADMIN). Вынесена из компонента: правила связи
 * статуса с исполнителем и сборку запроса проще всего проверять без рендера.
 */

/** Значения формы: строки, как в `select`/`input`; '' — поле не задано. */
export interface TicketEditValues {
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  objectId: string;
  roomId: string;
  assigneeId: string;
  description: string;
  lat: string;
  lng: string;
}

export type TicketEditErrors = Partial<Record<keyof TicketEditValues, string>>;

export function editValuesOf(ticket: TicketEntity): TicketEditValues {
  return {
    type: ticket.type,
    priority: ticket.priority,
    status: ticket.status,
    objectId: ticket.objectId,
    roomId: ticket.roomId ?? '',
    assigneeId: ticket.assigneeId ?? '',
    description: ticket.description,
    lat: ticket.lat === null ? '' : String(ticket.lat),
    lng: ticket.lng === null ? '' : String(ticket.lng),
  };
}

/** У новой заявки исполнителя нет: выбор «Новая» снимает его. */
export function withStatus(values: TicketEditValues, status: TicketStatus): TicketEditValues {
  return { ...values, status, assigneeId: status === 'new' ? '' : values.assigneeId };
}

/** Те же правила, что у ticket-service, когда статус явно не менялся. */
export function withAssignee(values: TicketEditValues, assigneeId: string): TicketEditValues {
  if (values.status === 'new' && assigneeId !== '') {
    return { ...values, assigneeId, status: 'assigned' };
  }
  if (values.status === 'assigned' && assigneeId === '') {
    return { ...values, assigneeId, status: 'new' };
  }
  return { ...values, assigneeId };
}

/** Число необязательно, но если введено — должно быть в диапазоне DTO. */
export function validateCoordinate(
  raw: string,
  min: number,
  max: number,
  label: string,
): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} — число`;
  if (value < min || value > max) return `${label} — от ${min} до ${max}`;
  return undefined;
}

export function editErrorsOf(ticket: TicketEntity, values: TicketEditValues): TicketEditErrors {
  const errors: TicketEditErrors = {};
  const description = values.description.trim();
  if (values.objectId === '') errors.objectId = 'Выберите объект';
  if (description === '') errors.description = 'Опишите работы';
  else if (description.length > 2000) errors.description = 'Не больше 2000 символов';

  const lat = validateCoordinate(values.lat, -90, 90, 'Широта');
  if (lat !== undefined) errors.lat = lat;
  const lng = validateCoordinate(values.lng, -180, 180, 'Долгота');
  if (lng !== undefined) errors.lng = lng;

  // Старую заявку в работе без исполнителя можно править, не трогая эти два поля.
  const touched =
    values.status !== ticket.status || values.assigneeId !== (ticket.assigneeId ?? '');
  if (
    touched &&
    values.assigneeId === '' &&
    (values.status === 'assigned' || values.status === 'in_progress' || values.status === 'paused')
  ) {
    errors.assigneeId = 'Для этого статуса укажите исполнителя';
  }
  return errors;
}

function coordinate(raw: string): number | null {
  return raw.trim() === '' ? null : Number(raw);
}

/** Запрос правки: только то, что действительно изменилось. */
export function buildTicketPatch(
  ticket: TicketEntity,
  values: TicketEditValues,
): UpdateTicketPayload {
  const patch: UpdateTicketPayload = {};
  const description = values.description.trim();
  const roomId = values.roomId === '' ? null : values.roomId;
  const assigneeId = values.assigneeId === '' ? null : values.assigneeId;
  const lat = coordinate(values.lat);
  const lng = coordinate(values.lng);

  if (values.type !== ticket.type) patch.type = values.type;
  if (values.priority !== ticket.priority) patch.priority = values.priority;
  if (values.status !== ticket.status) patch.status = values.status;
  if (values.objectId !== ticket.objectId) patch.objectId = values.objectId;
  if (roomId !== ticket.roomId) patch.roomId = roomId;
  if (assigneeId !== ticket.assigneeId) patch.assigneeId = assigneeId;
  if (description !== ticket.description) patch.description = description;
  if (lat !== ticket.lat) patch.lat = lat;
  if (lng !== ticket.lng) patch.lng = lng;
  return patch;
}
