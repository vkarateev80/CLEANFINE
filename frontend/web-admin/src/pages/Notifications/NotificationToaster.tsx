import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  notificationTypeIcon,
  type NotificationEntity,
  type NotificationsPage,
} from '../../types/notifications';
import { notificationTarget } from './NotificationBell';
import { useMarkNotificationRead, useUnreadNotifications } from './useNotifications';

/**
 * Всплывающие карточки новых уведомлений в админке (09.10.2026).
 *
 * До этого новое уведомление лишь меняло цифру на колокольчике — админ, глядя
 * на доску, не замечал ни SOS, ни сообщения оператора. Теперь по тому же опросу
 * непрочитанных (`useUnreadNotifications`) определяем, что появилось с прошлого
 * раза, и показываем карточки справа внизу; если вкладка свёрнута и разрешение
 * дано — ещё и системное уведомление браузера.
 */

const TOAST_TTL_MS = 12_000;
const MAX_TOASTS = 4;

export type BrowserNotificationsState = 'granted' | 'denied' | 'default' | 'unsupported';

export function browserNotificationsState(): BrowserNotificationsState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function enableBrowserNotifications(): Promise<BrowserNotificationsState> {
  if (browserNotificationsState() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return browserNotificationsState();
  }
}

/** Непрочитанные новее последнего виденного (страница отсортирована от новых). */
export function collectFresh(page: NotificationsPage, seenId: string | null): NotificationEntity[] {
  const fresh: NotificationEntity[] = [];
  for (const item of page.items) {
    if (item.id === seenId) break;
    fresh.push(item);
  }
  return fresh;
}

function systemNotification(item: NotificationEntity): void {
  if (browserNotificationsState() !== 'granted') return;
  try {
    const notification = new Notification(item.title, { body: item.body, tag: item.id });
    notification.onclick = () => {
      window.focus();
      window.location.hash = '';
      window.location.assign(notificationTarget(item));
      notification.close();
    };
  } catch {
    /* уведомление браузера — вспомогательный канал */
  }
}

export function NotificationToaster() {
  const unread = useUnreadNotifications();
  const markRead = useMarkNotificationRead();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<NotificationEntity[]>([]);
  const seen = useRef<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    const page = unread.data;
    if (!page) return;
    const newest = page.items[0] ?? null;
    if (!initialised.current) {
      initialised.current = true;
      seen.current = newest?.id ?? null;
      return;
    }
    if (!newest || newest.id === seen.current) return;
    const fresh = collectFresh(page, seen.current);
    seen.current = newest.id;
    if (fresh.length === 0) return;
    setToasts((current) => [...fresh, ...current].slice(0, MAX_TOASTS));
    if (document.visibilityState === 'hidden') {
      systemNotification(fresh[0]);
    }
  }, [unread.data]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const oldest = toasts[toasts.length - 1];
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== oldest.id));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  function dismiss(id: string) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function open(item: NotificationEntity) {
    markRead.mutate(item.id);
    dismiss(item.id);
    navigate(notificationTarget(item));
  }

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      data-testid="notification-toaster"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          data-testid={`notification-toast-${item.id}`}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-primary-200 bg-white p-3 shadow-lg"
        >
          <span className="text-xl" aria-hidden="true">
            {notificationTypeIcon(item.type)}
          </span>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => open(item)}
          >
            <span className="block text-sm font-medium text-neutral-900">{item.title}</span>
            <span className="line-clamp-2 block text-xs text-neutral-600">{item.body}</span>
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            className="text-neutral-400 hover:text-neutral-700"
            onClick={() => dismiss(item.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
