/**
 * Типы ответов notification-service. Как и в core/tickets, даты — строки:
 * axios разбирает JSON, где `Date` уже сериализован в ISO 8601.
 *
 * Значения `type` на бэкенде — ВЕРХНИЙ регистр (`notification-types.ts`), и
 * отдельного shared-модуля для них нет: словарь живёт в сервисе уведомлений.
 * Здесь он продублирован как данные (подписи для UI), потому что web-admin не
 * зависит от backend-пакетов.
 */

/** Словарь типов уведомлений (совпадает с NOTIFICATION_TYPES бэкенда). */
export const NOTIFICATION_TYPES = [
  'NEW_TICKET',
  'EMERGENCY',
  'TICKET_OVERDUE',
  'GEOFENCE_EXIT',
  'MATERIAL_LOW',
  'SCHEDULE_MISSED',
  'CHAT_MESSAGE',
  'TICKET_STATUS',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  NEW_TICKET: 'Новая заявка',
  EMERGENCY: 'Авария (SOS)',
  TICKET_OVERDUE: 'Просрочка заявки',
  GEOFENCE_EXIT: 'Выход за периметр',
  MATERIAL_LOW: 'Мало материала',
  SCHEDULE_MISSED: 'Неявка на смену',
  CHAT_MESSAGE: 'Сообщение в чате',
  TICKET_STATUS: 'Статус заявки',
};

/** Иконка типа — компактная подсказка в списке (текстовые подписи рядом). */
export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  NEW_TICKET: '📋',
  EMERGENCY: '🚨',
  TICKET_OVERDUE: '⏰',
  GEOFENCE_EXIT: '📍',
  MATERIAL_LOW: '📦',
  SCHEDULE_MISSED: '🗓️',
  CHAT_MESSAGE: '💬',
  TICKET_STATUS: '🎫',
};

/** Строковое поле payload (ticketId, chatId) или null. */
export function payloadString(
  notification: { payload: Record<string, unknown> | null },
  key: string,
): string | null {
  const value = notification.payload?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface NotificationEntity {
  id: string;
  userId: string;
  /** Строка, а не union: бэкенд может добавить тип раньше, чем админка. */
  type: string;
  title: string;
  body: string;
  /** Произвольный JSON события (например `{ ticketId }` для перехода к заявке). */
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** `GET /api/notifications` — пагинация страницами (page/limit), а не skip/take. */
export interface NotificationsPage {
  items: NotificationEntity[];
  total: number;
  page: number;
  limit: number;
  /** Число непрочитанных среди ВСЕХ уведомлений пользователя. */
  unreadCount: number;
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export interface RegisterDevicePayload {
  token: string;
  platform: DevicePlatform;
}

export interface NotificationSettings {
  userId: string;
  disabledTypes: string[];
  availableTypes: NotificationType[];
}

export interface UpdateNotificationSettingsPayload {
  disabledTypes: NotificationType[];
}

/** `payload.ticketId` — ссылка на заявку, если событие её содержит. */
export function ticketIdFromPayload(notification: NotificationEntity): string | null {
  const value = notification.payload?.ticketId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function notificationTypeLabel(type: string): string {
  return (NOTIFICATION_TYPE_LABELS as unknown as Record<string, string>)[type] ?? type;
}

export function notificationTypeIcon(type: string): string {
  return (NOTIFICATION_TYPE_ICONS as unknown as Record<string, string>)[type] ?? '🔔';
}
