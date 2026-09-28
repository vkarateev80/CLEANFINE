import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  updateNotificationSettings,
} from '../../api/notifications';
import type { ListNotificationsQuery, NotificationType } from '../../types/notifications';

/**
 * Данные in-app уведомлений. Счётчик непрочитанных обновляется опросом раз в
 * 30 секунд (`POLL_INTERVAL_MS`): WebSocket в контракте М3 не заявлен, а
 * опрос — самый дешёвый способ показать актуальный счётчик в колокольчике.
 */

export const UNREAD_POLL_MS = 30_000;

/** Полный список уведомлений (страница «Уведомления»). */
export function useNotifications(query: ListNotificationsQuery) {
  return useQuery({
    queryKey: ['notifications', query],
    queryFn: () => listNotifications(query),
    placeholderData: (previous) => previous,
  });
}

/**
 * Колокольчик: берём только непрочитанные (limit 1) — ответ уже содержит
 * `unreadCount` по всем уведомлениям, поэтому отдельный счётчик не нужен.
 */
export function useUnreadNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => listNotifications({ page: 1, limit: 1, unreadOnly: true }),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

/** Последние уведомления для выпадающего списка колокольчика. */
export function useRecentNotifications(limit: number, enabled = true) {
  return useQuery({
    queryKey: ['notifications-recent', limit],
    queryFn: () => listNotifications({ page: 1, limit }),
    enabled,
    staleTime: 10_000,
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => getNotificationSettings(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (disabledTypes: NotificationType[]) =>
      updateNotificationSettings({ disabledTypes }),
    onSuccess: (settings) => {
      queryClient.setQueryData(['notification-settings'], settings);
    },
  });
}

/** Отметка прочитанного: после успеха обновляем все списки уведомлений. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
    },
  });
}
