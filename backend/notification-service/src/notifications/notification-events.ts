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
 * | ticket.status_changed | TICKET_STATUS  | бригадиры+админы и автор заявки, без инициатора |
 *
 * `ticket.operation.completed` консьюмер не слушает: очередь
 * material.ticket.operation.completed обрабатывает material-service.
 * Остальные очереди EVENT_QUEUES покрыты NOTIFICATION_ROUTING_KEYS.
 *
 * ВАЖНО про emergency/overdue/material.low: контракт 3.2 не содержит списка
 * получателей, поэтому при их отсутствии применяется broadcast — уведомление
 * уходит бригадирам и админам из справочника auth-service плюс всем владельцам
 * активных устройств (09.10.2026: раньше только устройствам, и веб-админка не
 * получала SOS/эскалации). Когда издатель передаёт assigneeId/userIds
 * (аддитивное расширение payload), выборка сужается автоматически.
 */
export const NOTIFICATION_ROUTING_KEYS = [
  ROUTING_KEYS.TICKET_CREATED,
  ROUTING_KEYS.TICKET_ASSIGNED,
  ROUTING_KEYS.TICKET_EMERGENCY,
  ROUTING_KEYS.TICKET_OVERDUE,
  ROUTING_KEYS.GEOFENCE_EXIT,
  ROUTING_KEYS.MATERIAL_LOW,
  ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN,
  ROUTING_KEYS.TICKET_STATUS_CHANGED,
] as const;

export type NotificationRoutingKey = (typeof NOTIFICATION_ROUTING_KEYS)[number];

export interface ResolvedNotification {
  routingKey: string;
  template: NotificationType;
  /** Явные получатели из payload; пустой список означает broadcast. */
  userIds: string[];
  /**
   * Служебная аудитория: к получателям добавляются активные бригадиры и админы
   * из справочника (ticket.status_changed). Для broadcast они добавляются всегда.
   */
  includeStaff?: boolean;
  /** Кого исключить (инициатор действия не получает уведомление о себе). */
  excludeUserIds?: string[];
  params: TemplateParams;
  /** Данные уведомления: уходят в push.data и в notifications.payload. */
  data: Record<string, unknown>;
}

/** Текст TICKET_STATUS: описание и, если известен, инициатор через « · ». */
export function ticketStatusBody(description: string, actorName: string | undefined): string {
  return [description, actorName]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

/** Подписи статусов заявки для заголовка TICKET_STATUS. */
export const TICKET_STATUS_TITLES: Record<string, string> = {
  new: 'Заявка создана',
  assigned: '👤 Заявка назначена',
  in_progress: '▶️ Заявка в работе',
  paused: '⏸ Заявка приостановлена',
  completed: '✅ Заявка выполнена',
  verified: '☑️ Заявка проверена',
  rejected: '✖️ Заявка отклонена',
  closed: '🔒 Заявка закрыта',
  overdue: '⚠️ Заявка просрочена',
};

export const TICKET_TYPE_LABELS: Record<string, string> = {
  planned: 'плановая',
  unscheduled: 'внеплановая',
  emergency: 'аварийная',
};

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

    case ROUTING_KEYS.TICKET_STATUS_CHANGED: {
      const ticketId = asText(event.ticketId);
      const status = asText(event.status);
      if (ticketId === undefined || status === undefined) {
        return null;
      }
      const description = asText(event.description) ?? `Заявка ${ticketId}`;
      const actorId = asText(event.actorId);
      const actorName = asText(event.actorName);
      const typeLabel = TICKET_TYPE_LABELS[asText(event.type) ?? ''] ?? '';
      const title = TICKET_STATUS_TITLES[status] ?? `Заявка: ${status}`;
      // Текст: «Влажная уборка холла (плановая) · Оператор Иванов». JWT не несёт
      // имени, поэтому издатель кладёт логин; консьюмер заменит его именем из
      // справочника (ticketStatusBody), если найдёт инициатора.
      const body = ticketStatusBody(
        typeLabel ? `${description} (${typeLabel})` : description,
        actorName,
      );
      // Автор заявки (например, заказчик из портала) видит ход своей заявки;
      // исполнитель — нет: он сам её и двигает, а назначение приходит NEW_TICKET.
      const createdBy = asText(event.createdBy);
      return {
        routingKey,
        template: 'TICKET_STATUS',
        userIds: createdBy === undefined ? [] : [createdBy],
        includeStaff: true,
        excludeUserIds: actorId === undefined ? [] : [actorId],
        params: {
          title,
          body,
          description: typeLabel ? `${description} (${typeLabel})` : description,
        },
        data: {
          ticketId,
          status,
          previousStatus: asText(event.previousStatus) ?? '',
          objectId: asText(event.objectId) ?? '',
          assigneeId: asText(event.assigneeId) ?? '',
          actorId: actorId ?? '',
          changedAt: asText(event.changedAt) ?? '',
        },
      };
    }

    default:
      return null;
  }
}
