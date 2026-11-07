import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertUser } from '../../lib/alerts';
import { resubscribeIfGranted } from '../../lib/webPush';
import { notificationTypeIcon, type NotificationEntity } from '../../types/notifications';
import { notificationTarget } from './NotificationBell';
import { collectFresh, startSeen, type SeenNotifications } from './notificationHelpers';
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
  // null — первого ответа опроса ещё не было: то, что уже лежит в непрочитанных
  // при открытии админки, не всплывает.
  const seen = useRef<SeenNotifications | null>(null);

  useEffect(() => {
    const page = unread.data;
    if (!page) return;
    if (seen.current === null) {
      seen.current = startSeen(page);
      return;
    }
    const fresh = collectFresh(page, seen.current);
    if (fresh.length === 0) return;
    setToasts((current) => [...fresh, ...current].slice(0, MAX_TOASTS));
    // Звук (и вибрация на телефоне) при открытой вкладке; SOS — настойчивее.
    alertUser({
      vibrate: fresh[0].type === 'EMERGENCY' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    });
    if (document.visibilityState === 'hidden') {
      systemNotification(fresh[0]);
    }
  }, [unread.data]);

  // Разрешение уже дано — убеждаемся, что сервер знает подписку этого браузера.
  useEffect(() => {
    void resubscribeIfGranted().catch(() => undefined);
  }, []);

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
