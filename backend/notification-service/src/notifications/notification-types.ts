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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ['normal', 'high'] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}
