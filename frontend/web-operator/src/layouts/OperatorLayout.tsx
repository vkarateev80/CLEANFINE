import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { listMyChats } from '../api/chat';
import { useNotificationWatcher, useUnreadNotificationsCount } from '../hooks/useNotifications';
import { resubscribeIfGranted } from '../lib/webPush';
import { CountDot } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { OfflineBanner } from '../components/shell/OfflineBanner';
import { SosFab } from '../components/shell/SosFab';
import { SyncCounter } from '../components/shell/SyncCounter';
import { useKeyboardOpen } from '../lib/http';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Каркас shell-экранов (overview.md п. 3): шапка с заголовком экрана, счётчик
 * очереди и непрочитанных, оффлайн-баннер, нижний таб-бар из трёх пунктов и
 * постоянная кнопка SOS. Маршрут, чек-лист и SOS — полноэкранные, без каркаса.
 */
interface NavItem {
  to: string;
  label: string;
  glyph: string;
  testId: string;
}

const NAV: NavItem[] = [
  { to: '/today', label: 'Сегодня', glyph: '▣', testId: 'op-nav-today' },
  { to: '/chats', label: 'Чаты', glyph: '✉', testId: 'op-nav-chats' },
  { to: '/profile', label: 'Профиль', glyph: '◉', testId: 'op-nav-profile' },
];

export function useUnreadChats(): number {
  const accessToken = useAuthStore((s) => s.accessToken);
  const chats = useQuery({
    queryKey: ['chat', 'chats'],
    queryFn: listMyChats,
    enabled: Boolean(accessToken),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  return (chats.data ?? []).reduce((sum, chat) => sum + (chat.unreadCount ?? 0), 0);
}

export function OperatorLayout() {
  const title = useUiStore((s) => s.title);
  const keyboardOpen = useKeyboardOpen();
  const unread = useUnreadChats();
  const unreadNotifications = useUnreadNotificationsCount();
  useNotificationWatcher();

  // Разрешение на push уже дано (прошлый вход) — тихо убеждаемся, что сервер
  // знает подписку этого браузера под текущим пользователем.
  useEffect(() => {
    void resubscribeIfGranted().catch(() => undefined);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-4">
          <h1
            className="min-w-0 flex-1 truncate text-xl font-semibold text-neutral-900"
            data-testid="op-header-title"
            title={title}
          >
            {title}
          </h1>
          <SyncCounter />
          <NavLink
            to="/notifications"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg text-neutral-500 hover:bg-neutral-100"
            aria-label={
              unreadNotifications > 0
                ? `Непрочитанных уведомлений: ${unreadNotifications}`
                : 'Уведомления'
            }
            data-testid="op-notifications"
          >
            <span aria-hidden="true">🔔</span>
            <CountDot value={unreadNotifications} label="" />
          </NavLink>
        </div>
        <OfflineBanner />
      </header>

      <main className="op-main mx-auto w-full max-w-screen-md flex-1 p-4">
        <Outlet />
      </main>

      {!keyboardOpen && <SosFab />}

      {!keyboardOpen && (
        <nav
          className="op-tabbar fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-neutral-200 bg-white shadow-lg"
          aria-label="Разделы приложения"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testId}
              className={({ isActive }) =>
                [
                  'relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors',
                  isActive ? 'text-primary-600' : 'text-neutral-500',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'absolute inset-x-6 top-0 h-0.5 rounded-full',
                      isActive ? 'bg-primary-600' : 'bg-transparent',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  <span className="relative text-base leading-none" aria-hidden="true">
                    {item.glyph}
                    {item.to === '/chats' && unread > 0 && (
                      <span className="absolute -right-3 -top-2">
                        <CountDot value={unread} label="" />
                      </span>
                    )}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
      <Toast />
    </div>
  );
}
