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
  TicketCreatedEvent,
  TicketEmergencyEvent,
  TicketOverdueEvent,
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

export type TicketCreatedPayload = TicketCreatedEvent & NotificationTargeting;
export type TicketEmergencyPayload = TicketEmergencyEvent & NotificationTargeting;
export type TicketOverduePayload = TicketOverdueEvent & NotificationTargeting;

/**
 * Целевые получатели по заявке. Отдельная функция — чтобы правило было одно на все события
 * и его можно было проверить тестом.
 */
export function notificationTargets(ticket: { assigneeId: string | null }): NotificationTargeting {
  return { assigneeId: ticket.assigneeId ?? null };
}
