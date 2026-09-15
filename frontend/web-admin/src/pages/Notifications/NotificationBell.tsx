import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
import { ROUTES } from '../../router/routes';
import { notificationTypeIcon, notificationTypeLabel, ticketIdFromPayload } from '../../types/notifications';
import { formatDateTime } from '../Tickets/ticketHelpers';
import { useMarkNotificationRead, useRecentNotifications, useUnreadNotifications } from './useNotifications';

const RECENT_LIMIT = 5;

/**
 * Колокольчик уведомлений в шапке админки: счётчик непрочитанных + выпадающий
 * список последних уведомлений.
 *
 * Почему свой dropdown, а не `Modal`: панель должна закрываться по клику вне и по
 * Esc, не перекрывая страницу оверлеем (тот же приём, что у `ActionMenu` строки).
 *
 * Опрос — раз в 30 с (`useUnreadNotifications`): контракт М3 не содержит
 * WebSocket, а in-app запись создаётся всегда, даже без push-устройств.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = useUnreadNotifications();
  const recent = useRecentNotifications(RECENT_LIMIT, open);
  const markRead = useMarkNotificationRead();

  const unreadCount = unread.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function openNotification(id: string, ticketId: string | null) {
    markRead.mutate(id);
    setOpen(false);
    if (ticketId) navigate(ROUTES.ticket(ticketId));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="notification-bell"
        aria-label={
          unreadCount > 0 ? `Уведомления: ${unreadCount} непрочитанных` : 'Уведомления'
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-lg px-3 py-1.5 text-lg text-neutral-600 hover:bg-neutral-100"
        onClick={() => setOpen((value) => !value)}
      >
        🔔
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-[11px] font-medium leading-[18px] text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-96 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
            <span className="text-sm font-medium text-neutral-900">Уведомления</span>
            {unreadCount > 0 && (
              <span className="text-xs text-neutral-500">непрочитанных: {unreadCount}</span>
            )}
          </div>

          {recent.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-neutral-500">
              <Spinner /> Загрузка…
            </div>
          ) : recent.isError ? (
            <div className="px-4 py-6 text-sm text-danger-600">
              Не удалось загрузить уведомления
            </div>
          ) : (recent.data?.items.length ?? 0) === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-400">Уведомлений нет</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {recent.data?.items.map((item) => {
                const ticketId = ticketIdFromPayload(item);
                return (
                  <li key={item.id} className="border-b border-neutral-100 last:border-b-0">
                    <button
                      type="button"
                      role="menuitem"
                      data-testid={`notification-item-${item.id}`}
                      className={[
                        'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-neutral-50',
                        item.readAt ? 'bg-white' : 'bg-primary-50',
                      ].join(' ')}
                      onClick={() => openNotification(item.id, ticketId)}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                        <span>
                          {notificationTypeIcon(item.type)} {notificationTypeLabel(item.type)}
                        </span>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </span>
                      <span className="text-sm font-medium text-neutral-900">{item.title}</span>
                      <span className="line-clamp-2 text-xs text-neutral-600">{item.body}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-neutral-200 px-4 py-2">
            <Link
              to={ROUTES.notifications}
              className="text-sm text-primary-600 hover:underline"
              onClick={() => setOpen(false)}
            >
              Все уведомления
            </Link>
            <Button variant="ghost" size="sm" onClick={() => void recent.refetch()}>
              Обновить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
