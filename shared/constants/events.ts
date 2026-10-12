/**
 * Имена exchange/routing key событий CLEANFINE.
 * Контракт зафиксирован в М0.7 — изменения только через review архитектора.
 */
export const EVENTS_EXCHANGE = 'cleaning-ops.events';
export const EVENTS_EXCHANGE_DLQ = 'cleaning-ops.events.dlq';

export const ROUTING_KEYS = {
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_EMERGENCY: 'ticket.emergency',
  TICKET_OVERDUE: 'ticket.overdue',
  TICKET_OPERATION_COMPLETED: 'ticket.operation.completed',
  /** Смена статуса заявки (в работе/выполнена/…) — для бригадира, админа и автора заявки. */
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  GEOFENCE_EXIT: 'geofence.exit',
  MATERIAL_LOW: 'material.low',
  SCHEDULE_MISSED_CHECKIN: 'schedule.missed_checkin',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

export const EVENT_QUEUES: Record<RoutingKey, string> = {
  [ROUTING_KEYS.TICKET_CREATED]: 'notification.ticket.created',
  [ROUTING_KEYS.TICKET_ASSIGNED]: 'notification.ticket.assigned',
  [ROUTING_KEYS.TICKET_EMERGENCY]: 'notification.ticket.emergency',
  [ROUTING_KEYS.TICKET_OVERDUE]: 'notification.ticket.overdue',
  [ROUTING_KEYS.TICKET_OPERATION_COMPLETED]: 'material.ticket.operation.completed',
  [ROUTING_KEYS.TICKET_STATUS_CHANGED]: 'notification.ticket.status_changed',
  [ROUTING_KEYS.GEOFENCE_EXIT]: 'notification.geofence.exit',
  [ROUTING_KEYS.MATERIAL_LOW]: 'notification.material.low',
  [ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN]: 'notification.schedule.missed_checkin',
};
