/**
 * Payload'ы событий ticket-service: базовые поля — контракт 3.2 (ПЛАН.md, shared/types/events.ts),
 * плюс АДДИТИВНОЕ расширение, согласованное с notification-service (М3.3).
 *
 * Расширение: notification-service выбирает получателей push из payload —
 * `assigneeId` (или `userIds`). Если полей нет, уведомление рассылается всем владельцам
 * активных устройств (broadcast). Поэтому ticket-service ВСЕГДА кладёт `assigneeId`
 * (null, если исполнитель ещё не назначен — тогда срабатывает broadcast).
 *
 * `shared/` не меняется: расширение живёт на стороне продюсера и не ломает читателей,
 * которые знают только базовые поля.
 */
import type {
  TicketAssignedEvent,
  TicketCreatedEvent,
  TicketEmergencyEvent,
  TicketOverdueEvent,
  TicketStatusChangedEvent,
} from '@cleaning-ops/shared/types/events';

/** Кому адресовать уведомление (потребитель — notification-service). */
export interface NotificationTargeting {
  /**
   * Исполнитель заявки. null — получатель неизвестен, notification-service рассылает всем
   * (для аварийной заявки это и нужно: оператор + бригадир + админ).
   */
  assigneeId?: string | null;
  /**
   * Явный список получателей (например, бригадир/админ) для адресной рассылки.
   * Заполняется только когда получатели действительно известны ticket-service.
   */
  userIds?: string[];
}

/**
 * Окно смены плановой заявки (22.10.2026): по нему notification-service понимает,
 * что задача плановая и создана ночной генерацией — push не нужен, только in-app.
 */
export interface TicketScheduleWindow {
  plannedStart?: string;
  plannedEnd?: string;
}

export type TicketCreatedPayload = TicketCreatedEvent & NotificationTargeting & TicketScheduleWindow;
/**
 * `onCreate` — назначение произошло при создании заявки: ticket.created уже
 * ушёл с assigneeId, и notification-service не шлёт второе «Новая задача».
 */
export type TicketAssignedPayload = TicketAssignedEvent & { onCreate?: boolean };
export type TicketEmergencyPayload = TicketEmergencyEvent & NotificationTargeting;
export type TicketOverduePayload = TicketOverdueEvent & NotificationTargeting;
export type TicketStatusChangedPayload = TicketStatusChangedEvent & NotificationTargeting;

/** Минимум полей заявки, нужный событию смены статуса. */
export interface StatusChangeSource {
  id: string;
  type: string;
  description: string;
  objectId: string;
  assigneeId: string | null;
  createdBy: string;
}

/**
 * Payload ticket.status_changed. Получателей здесь нет намеренно: ticket-service не
 * знает ролей пользователей, список бригадиров/админов собирает notification-service.
 * `actorId` нужен, чтобы инициатор не получил уведомление о собственном действии.
 */
export function statusChangedPayload(
  ticket: StatusChangeSource,
  status: string,
  previousStatus: string,
  actor: { id: string; fullName?: string | null; email?: string } | null,
  changedAt: Date,
): TicketStatusChangedPayload {
  return {
    ticketId: ticket.id,
    status,
    previousStatus,
    type: ticket.type,
    description: ticket.description,
    objectId: ticket.objectId,
    assigneeId: ticket.assigneeId ?? null,
    createdBy: ticket.createdBy,
    actorId: actor?.id ?? null,
    actorName: actor ? (actor.fullName?.trim() || actor.email || null) : null,
    changedAt: changedAt.toISOString(),
  };
}

/**
 * Целевые получатели по заявке. Отдельная функция — чтобы правило было одно на все события
 * и его можно было проверить тестом.
 */
export function notificationTargets(ticket: { assigneeId: string | null }): NotificationTargeting {
  return { assigneeId: ticket.assigneeId ?? null };
}
