import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getScheduleSettings } from '../api/schedule';
import { useTimeZoneStore } from '../stores/timeZoneStore';
import { logout } from '../api/auth';
import { Button } from '../components/ui/Button';
import { ObjectScopeProvider } from '../components/object/ObjectScopeContext';
import { useKeyboardOpen } from '../lib/http';
import { useObjectScope } from '../hooks/useObjectScope';
import { useSession } from '../hooks/useSession';

/**
 * Каркас портала заказчика (DS-004, `overview.md` п. 3): заголовок объекта +
 * нижний таб-бар на телефоне.
 *
 * Отличия от `AdminLayout` админки принципиальные: портал **mobile-first**, у него
 * нет sidebar и нет поиска по разделам — четыре пункта внизу, где до них достаёт
 * большой палец. На `≥1024 px` (редкий сценарий для портала) таб-бар скрывается,
 * а пункты переезжают в header горизонтальным меню: на широком экране фиксированная
 * полоса внизу выглядит как чужеродный элемент.
 */

interface NavItem {
  to: string;
  label: string;
  glyph: string;
  testId: string;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Статус', glyph: '◧', testId: 'portal-nav-dashboard' },
  { to: '/tickets', label: 'Заявки', glyph: '☑', testId: 'portal-nav-tickets' },
  { to: '/reports', label: 'Отчёты', glyph: '▤', testId: 'portal-nav-reports' },
  { to: '/chat', label: 'Чат', glyph: '✉', testId: 'portal-nav-chat' },
];

export function ClientLayout() {
  const { user } = useSession();
  // Пояс расписания организации: время смен и заявок портал показывает в нём.
  const settings = useQuery({
    queryKey: ['schedule', 'settings'],
    queryFn: getScheduleSettings,
    staleTime: 5 * 60_000,
  });
  const setTimeZone = useTimeZoneStore((s) => s.setTimeZone);
  const timeZone = useTimeZoneStore((s) => s.timeZone);
  useEffect(() => {
    if (settings.data?.timeZone) setTimeZone(settings.data.timeZone);
  }, [settings.data?.timeZone, setTimeZone]);
  const scope = useObjectScope(user);
  const navigate = useNavigate();
  const keyboardOpen = useKeyboardOpen();

  // Заголовок каркаса: `{clientName} · {objectName}` (минимальный branding по DS-004).
  // Пока объект не определён, показываем подпись портала — иначе в шапке был бы
  // пустой прямоугольник, и пользователь не понял бы, что вообще открылось.
  const headerTitle = scope.object
    ? `${scope.object.clientName} · ${scope.object.name}`
    : 'Портал заказчика';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <ObjectScopeProvider scope={scope}>
      <div className="flex min-h-[100dvh] flex-col bg-neutral-50">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4">
          <div
            className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900"
            title={headerTitle}
            data-testid="portal-header-object"
          >
            {headerTitle}
          </div>

          {/* Отладочный режим ADMIN — заметная метка: видно, что объект выбран вручную. */}
          {scope.isDebug && (
            <span
              className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700"
              data-testid="portal-debug-badge"
            >
              отладка
            </span>
          )}

          {/* Пункты меню на широком экране: таб-бар там скрыт (DS-004 п. 7). */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Разделы портала">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`${item.testId}-desktop`}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-neutral-600 hover:bg-neutral-100',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden text-right sm:block">
            <div className="max-w-[10rem] truncate text-xs text-neutral-500">{user?.fullName}</div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleLogout()}
            className="min-h-[44px]"
          >
            Выйти
          </Button>
        </header>

        <main className="portal-main mx-auto w-full max-w-screen-md flex-1 p-4">
          {/* Ключ по поясу: после смены пояса экраны пересчитывают время. */}
          <Outlet key={timeZone} />
        </main>

        {/*
          Таб-бар скрывается, пока открыта экранная клавиатура: иначе он
          перекрывает поле ввода в форме заявки и в чате (DS-004, `overview.md` п. 3).
        */}
        {!keyboardOpen && (
          <nav
            className="portal-tabbar fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-neutral-200 bg-white shadow-lg lg:hidden"
            aria-label="Навигация портала"
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
                        'absolute inset-x-4 top-0 h-0.5 rounded-full',
                        isActive ? 'bg-primary-600' : 'bg-transparent',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    <span className="text-base leading-none" aria-hidden="true">
                      {item.glyph}
                    </span>
                    <span className="text-[10px] sm:text-xs">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </ObjectScopeProvider>
  );
}

/**
 * Футер портала (подпись роли). Отдельным компонентом, потому что используется
 * на экранах, где каркас ещё не отрисован (например, отказ по роли).
 */
export function PortalFooter() {
  return (
    <div className="px-4 py-3 text-center text-xs text-neutral-500">
      Портал заказчика · CLEANFINE
    </div>
  );
}
