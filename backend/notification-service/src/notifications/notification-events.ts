import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import type { TemplateParams } from './notification-templates';
import type { NotificationType } from './notification-types';

/**
 * Routing keys, которые превращаются в уведомления (М3.3).
 * Соответствие routing key → шаблон:
 *
 * | routing key          | шаблон         | получатели                                    |
 * |----------------------|----------------|-----------------------------------------------|
 * | ticket.created       | NEW_TICKET     | assigneeId из payload                          |
 * | ticket.assigned      | NEW_TICKET     | assigneeId из payload                          |
 * | ticket.emergency     | EMERGENCY      | userIds/assigneeId из payload, иначе broadcast |
 * | ticket.overdue       | TICKET_OVERDUE | userIds/assigneeId из payload, иначе broadcast |
 * | geofence.exit        | GEOFENCE_EXIT  | userId из payload                              |
 * | material.low         | MATERIAL_LOW   | userIds из payload, иначе broadcast            |
 * | schedule.missed_checkin | SCHEDULE_MISSED | userId из payload, иначе broadcast         |
 *
 * `ticket.operation.completed` консьюмер не слушает: очередь
 * material.ticket.operation.completed обрабатывает material-service.
 * Остальные очереди EVENT_QUEUES покрыты NOTIFICATION_ROUTING_KEYS.
 *
 * ВАЖНО про emergency/overdue/material.low: контракт 3.2 не содержит списка
 * получателей, поэтому при их отсутствии применяется broadcast — уведомление
 * уходит всем владельцам активных устройств. Когда издатель начнёт передавать
 * assigneeId/userIds (аддитивное расширение payload), выборка сузится
 * автоматически, без изменения кода.
 */
export const NOTIFICATION_ROUTING_KEYS = [
  ROUTING_KEYS.TICKET_CREATED,
  ROUTING_KEYS.TICKET_ASSIGNED,
  ROUTING_KEYS.TICKET_EMERGENCY,
  ROUTING_KEYS.TICKET_OVERDUE,
  ROUTING_KEYS.GEOFENCE_EXIT,
  ROUTING_KEYS.MATERIAL_LOW,
  ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN,
] as const;

export type NotificationRoutingKey = (typeof NOTIFICATION_ROUTING_KEYS)[number];

export interface ResolvedNotification {
  routingKey: string;
  template: NotificationType;
  /** Явные получатели из payload; пустой список означает broadcast. */
  userIds: string[];
  params: TemplateParams;
  /** Данные уведомления: уходят в push.data и в notifications.payload. */
  data: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Получатели, явно перечисленные издателем: assigneeId и/или userIds. */
function collectRecipients(payload: Record<string, unknown>): string[] {
  const recipients = asTextArray(payload.userIds);
  const assigneeId = asText(payload.assigneeId);
  if (assigneeId !== undefined && !recipients.includes(assigneeId)) {
    recipients.push(assigneeId);
  }
  return recipients;
}

const pad2 = (part: number): string => String(part).padStart(2, '0');

/**
 * Плановое начало смены (ISO 8601 от schedule-service) → «ДД.ММ.ГГГГ ЧЧ:ММ UTC».
 * Время показываем в UTC: графики в schedule-service хранят время в UTC, и
 * сервис уведомлений не знает часовой пояс получателя.
 * Отсутствующее или неразбираемое значение даёт понятную подпись/исходную строку,
 * чтобы пользователь не увидел пустое место или "Invalid Date".
 */
function formatPlannedStart(value: unknown): string {
  const raw = asText(value);
  if (raw === undefined) {
    return 'по графику';
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return (
    `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`
  );
}

/**
 * Преобразует событие RabbitMQ в уведомление.
 * Возвращает null, если routing key не поддержан или в payload нет
 * обязательных полей — такое сообщение отбрасывается с предупреждением
 * (повторная доставка не поможет: контракт события нарушен).
 */
export function resolveEvent(routingKey: string, payload: unknown): ResolvedNotification | null {
  const event = asRecord(payload);
  if (event === null) {
    return null;
  }

  switch (routingKey) {
    case ROUTING_KEYS.TICKET_CREATED: {
      const ticketId = asText(event.ticketId);
      const assigneeId = asText(event.assigneeId);
      if (ticketId === undefined || assigneeId === undefined) {
        return null;
      }
      const description = asText(event.description) ?? `Заявка ${ticketId}`;
      return {
        routingKey,
        template: 'NEW_TICKET',
        userIds: [assigneeId],
        params: { ticketDescription: description },
        data: { ticketId },
      };
    }

    case ROUTING_KEYS.TICKET_ASSIGNED: {
      const ticketId = asText(event.ticketId);
      const assigneeId = asText(event.assigneeId);
      if (ticketId === undefined || assigneeId === undefined) {
        return null;
      }
      return {
        routingKey,
        template: 'NEW_TICKET',
        userIds: [assigneeId],
        params: { ticketDescription: `Заявка ${ticketId}` },
        data: { ticketId },
      };
    }

    case ROUTING_KEYS.TICKET_EMERGENCY: {
      const type = asText(event.type);
      const objectName = asText(event.objectName);
      if (type === undefined || objectName === undefined) {
        return null;
      }
      const floor = asText(event.floor) ?? '';
      return {
        routingKey,
        template: 'EMERGENCY',
        userIds: collectRecipients(event),
        params: { type, objectName, floor },
        data: {
          ticketId: asText(event.ticketId) ?? '',
          objectName,
          floor,
          lat: asNumber(event.lat) ?? '',
          lng: asNumber(event.lng) ?? '',
        },
      };
    }

    case ROUTING_KEYS.TICKET_OVERDUE: {
      const ticketId = asText(event.ticketId);
      const minutesOverdue = asNumber(event.minutesOverdue);
      if (ticketId === undefined || minutesOverdue === undefined) {
        return null;
      }
      return {
        routingKey,
        template: 'TICKET_OVERDUE',
        userIds: collectRecipients(event),
        params: { ticketId, minutes: Math.round(minutesOverdue) },
        data: { ticketId, minutesOverdue },
      };
    }

    case ROUTING_KEYS.GEOFENCE_EXIT: {
      const userId = asText(event.userId);
      if (userId === undefined) {
        return null;
      }
      return {
        routingKey,
        template: 'GEOFENCE_EXIT',
        userIds: [userId],
        params: { employeeName: asText(event.employeeName) ?? 'Сотрудник' },
        data: { userId, objectId: asText(event.objectId) ?? '' },
      };
    }

    case ROUTING_KEYS.MATERIAL_LOW: {
      const materialName = asText(event.materialName);
      const objectName = asText(event.objectName);
      if (materialName === undefined || objectName === undefined) {
        return null;
      }
      return {
        routingKey,
        template: 'MATERIAL_LOW',
        userIds: collectRecipients(event),
        params: { materialName, objectName },
        data: {
          materialId: asText(event.materialId) ?? '',
          objectId: asText(event.objectId) ?? '',
          quantity: asNumber(event.quantity) ?? '',
        },
      };
    }

    case ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN: {
      // Контракт schedule-service (event-payloads.ts) требует scheduleId; objectName
      // может быть пустой строкой — у графика не задан objectId. Тогда в тексте
      // остаётся нейтральная формулировка, а не пустое место.
      const scheduleId = asText(event.scheduleId);
      if (scheduleId === undefined) {
        return null;
      }
      const userId = asText(event.userId);
      const objectName = asText(event.objectName) ?? 'объект не указан';
      const plannedStart = asText(event.plannedStart) ?? '';
      return {
        routingKey,
        template: 'SCHEDULE_MISSED',
        // Событие адресное: уведомляем сотрудника из userId. Пустой/отсутствующий
        // userId означает нарушение контракта у издателя — консьюмер сделает broadcast.
        userIds: userId === undefined ? [] : [userId],
        params: { objectName, plannedStart: formatPlannedStart(plannedStart) },
        data: {
          eventId: asText(event.eventId) ?? '',
          scheduleId,
          userId: userId ?? '',
          objectId: asText(event.objectId) ?? '',
          objectName,
          plannedStart,
          detectedAt: asText(event.detectedAt) ?? '',
        },
      };
    }

    default:
      return null;
  }
}
