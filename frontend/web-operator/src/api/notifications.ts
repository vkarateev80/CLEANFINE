import { apiClient } from './client';
import type {
  ListNotificationsQuery,
  NotificationEntity,
  NotificationSettings,
  NotificationsPage,
  RegisterDevicePayload,
  UpdateNotificationSettingsPayload,
} from '../types/notifications';

/**
 * Клиент notification-service (:3006 через прокси `/api/notifications`).
 * Все методы работают только с данными текущего пользователя: `userId` берётся
 * на бэкенде из JWT, а не из тела запроса.
 */

/** Список уведомлений: пагинация страницами + `unreadCount` (для колокольчика). */
export function listNotifications(query: ListNotificationsQuery = {}): Promise<NotificationsPage> {
  return apiClient.get('/notifications', { params: query }).then((r) => r.data);
}

/** Отметка прочитанного идемпотентна — повторный вызов безопасен. */
export function markNotificationRead(id: string): Promise<NotificationEntity> {
  return apiClient.patch(`/notifications/${id}/read`).then((r) => r.data);
}

export function getNotificationSettings(): Promise<NotificationSettings> {
  return apiClient.get('/notifications/settings').then((r) => r.data);
}

export function updateNotificationSettings(
  payload: UpdateNotificationSettingsPayload,
): Promise<NotificationSettings> {
  return apiClient.patch('/notifications/settings', payload).then((r) => r.data);
}

/** Регистрация web-устройства (браузера): токен — JSON push-подписки. */
export function registerDevice(payload: RegisterDevicePayload): Promise<unknown> {
  return apiClient.post('/notifications/device', payload).then((r) => r.data);
}

/** Отписка устройства (выход, отключение push). Чужой токен сервер не трогает. */
export function unregisterDevice(token: string): Promise<void> {
  return apiClient
    .delete(`/notifications/device/${encodeURIComponent(token)}`)
    .then(() => undefined);
}

/** Публичный ключ VAPID; null — Web Push на сервере не настроен. */
export function getWebPushPublicKey(): Promise<string | null> {
  return apiClient
    .get<{ publicKey: string | null }>('/notifications/web-push/public-key')
    .then((r) => r.data.publicKey ?? null);
}
