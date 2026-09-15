/**
 * Общий setup для jest.
 *
 * Workspace-пакет @cleaning-ops/shared собирается как ESM в shared/dist и не
 * резолвится из node_modules сервиса (как в core/file-service), поэтому контракт
 * событий подменяется виртуальным моком. ВАЖНО: значения повторяют
 * shared/constants/events.ts — при изменении контракта (М0.7) править здесь тоже.
 */
jest.mock(
  '@cleaning-ops/shared/constants/events',
  () => ({
    EVENTS_EXCHANGE: 'cleaning-ops.events',
    EVENTS_EXCHANGE_DLQ: 'cleaning-ops.events.dlq',
    ROUTING_KEYS: {
      TICKET_CREATED: 'ticket.created',
      TICKET_ASSIGNED: 'ticket.assigned',
      TICKET_EMERGENCY: 'ticket.emergency',
      TICKET_OVERDUE: 'ticket.overdue',
      TICKET_OPERATION_COMPLETED: 'ticket.operation.completed',
      GEOFENCE_EXIT: 'geofence.exit',
      MATERIAL_LOW: 'material.low',
      SCHEDULE_MISSED_CHECKIN: 'schedule.missed_checkin',
    },
  }),
  { virtual: true },
);
