/**
 * Типы уведомлений и устройств. Единый словарь для шаблонов, in-app записей
 * и настроек подписок (notification_preferences.disabledTypes).
 *
 * Осознанное решение: в БД и API используется ВЕРХНИЙ регистр ключей шаблонов
 * (EMERGENCY, а не 'emergency' из примера в docs/agents/BACKEND_NOTIFICATIONS.md).
 * Так один и тот же набор значений используется и в шаблонах, и в настройках,
 * и не появляется второй словарь-переводчик.
 */

export const NOTIFICATION_TYPES = [
  'NEW_TICKET',
  'EMERGENCY',
  'TICKET_OVERDUE',
  'GEOFENCE_EXIT',
  'MATERIAL_LOW',
  'SCHEDULE_MISSED',
  // Сообщение чата оффлайн-получателю (М5.1): приходит не через RabbitMQ, а
  // внутренним REST-вызовом chat-service — routing key `chat.message` в
  // shared/constants/events.ts отсутствует.
  'CHAT_MESSAGE',
  // Смена статуса заявки (в работе/выполнена/…) — бригадиру, админу и автору
  // заявки (09.10.2026, событие ticket.status_changed).
  'TICKET_STATUS',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ['normal', 'high'] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}
