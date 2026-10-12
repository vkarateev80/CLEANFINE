import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { listNotifications, markNotificationRead } from '../api/notifications';
import { alertUser } from '../lib/alerts';
import { useAuthStore } from '../stores/authStore';
import { showToast } from '../stores/uiStore';
import type { NotificationEntity, NotificationsPage } from '../types/notifications';

/**
 * In-app уведомления оператора (09.10.2026). Раньше колокольчик считал только
 * чаты, а записи notification-service (новая заявка, SOS, просрочка, сообщение
 * из чата, когда экран чата закрыт) в вебе не показывались вовсе.
 *
 * Опрос раз в 30 с + при возврате на вкладку: WebSocket для уведомлений в
 * контракте нет. Push при закрытой странице — `lib/webPush.ts` + `sw.js`.
 */
export const UNREAD_POLL_MS = 30_000;

/** Непрочитанные (первая страница) + `unreadCount` по всем. */
export function useUnreadNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => listNotifications({ page: 1, limit: 10, unreadOnly: true }),
    enabled: Boolean(accessToken),
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

export function useUnreadNotificationsCount(): number {
  const unread = useUnreadNotifications();
  return unread.data?.unreadCount ?? 0;
}

/** Полный список (страница «Уведомления»). */
export function useNotificationsList(page: number, limit = 30) {
  return useQuery({
    queryKey: ['notifications', 'list', page, limit],
    queryFn: () => listNotifications({ page, limit }),
    placeholderData: (previous) => previous,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });
}

/**
 * Следит за появлением новых непрочитанных: показывает снекбар, а если вкладка
 * свёрнута и разрешение дано — системное уведомление через service worker
 * (на Android без SW `new Notification()` не работает).
 */
export function useNotificationWatcher(): void {
  const unread = useUnreadNotifications();
  const seen = useRef<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    const page = unread.data;
    if (!page) return;
    const newest = page.items[0] ?? null;
    if (!initialised.current) {
      // Первая загрузка — старые непрочитанные не считаем «новыми».
      initialised.current = true;
      seen.current = newest?.id ?? null;
      return;
    }
    if (!newest || newest.id === seen.current) return;
    const fresh = collectFresh(page, seen.current);
    seen.current = newest.id;
    if (fresh.length === 0) return;
    const first = fresh[0];
    showToast(
      fresh.length === 1 ? `${first.title}: ${first.body}` : `Новых уведомлений: ${fresh.length}`,
      'info',
    );
    // Звук и вибрация при открытой странице (12.10.2026): SOS — длиннее.
    alertUser({
      vibrate: first.type === 'EMERGENCY' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    });
    if (document.visibilityState === 'hidden') {
      void systemNotification(first);
    }
  }, [unread.data]);
}

/** Непрочитанные новее последнего виденного (по порядку страницы — сверху новые). */
export function collectFresh(page: NotificationsPage, seenId: string | null): NotificationEntity[] {
  const fresh: NotificationEntity[] = [];
  for (const item of page.items) {
    if (item.id === seenId) break;
    fresh.push(item);
  }
  return fresh;
}

async function systemNotification(item: NotificationEntity): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);
    if (registration) {
      await registration.showNotification(item.title, {
        body: item.body,
        tag: item.id,
        data: { ...(item.payload ?? {}), type: item.type },
      });
      return;
    }
    // Нет service worker (dev): уведомление страницы.
    new Notification(item.title, { body: item.body, tag: item.id });
  } catch {
    /* уведомление — не критичная функция */
  }
}
