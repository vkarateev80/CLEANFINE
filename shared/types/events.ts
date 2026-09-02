/**
 * Контракт событий RabbitMQ (фиксируется в М0.7, далее не меняется без review
 * архитектора). Exchange: cleaning-ops.events (см. constants/events.ts).
 * Поля событий — по ПЛАН.md (таблица контракта 3.2).
 */

export interface TicketCreatedEvent {
  ticketId: string;
  assigneeId: string;
  description: string;
}

export interface TicketAssignedEvent {
  ticketId: string;
  assigneeId: string;
}

export interface TicketEmergencyEvent {
  ticketId: string;
  type: string;
  objectName: string;
  floor: string;
  lat?: number;
  lng?: number;
}

export interface TicketOverdueEvent {
  ticketId: string;
  minutesOverdue: number;
}

/** Завершение операции техкарты → material-service списывает материалы. */
export interface TicketOperationCompletedEvent {
  operationId: string;
  ticketId: string;
  objectId: string;
  completedAt: string;
}

export interface GeofenceExitEvent {
  userId: string;
  employeeName: string;
  objectId: string;
  timestamp: string;
}

export interface MaterialLowEvent {
  materialId: string;
  materialName: string;
  objectId: string;
  objectName: string;
  quantity: number;
}

export interface ScheduleMissedCheckinEvent {
  userId: string;
  scheduleId: string;
  objectName: string;
}
