import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { logout } from '../api/auth';
import { BottomNav } from '../components/layout/BottomNav';
import { MobileDrawer } from '../components/layout/MobileDrawer';
import { Button } from '../components/ui/Button';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { NotificationBell } from '../pages/Notifications/NotificationBell';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export interface NavItem {
  to: string;
  label: string;
  /**
   * Иконка пункта (emoji — как уже принято в проекте: 🧹, 🔔, ✕; новая
   * зависимость на icon-set не вводится). На планшете 768–1023 px сайдбар
   * сжимается в рейку `w-16`, подписи там скрыты, и иконка остаётся
   * единственным ориентиром пункта.
   */
  icon: string;
  roles?: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Доска действий', icon: '📊', end: true },
  { to: '/objects', label: 'Объекты', icon: '🏢' },
  // Маршруты и техкарты — рабочие места ADMIN/SUPERVISOR: ровно те роли,
  // которым core-service разрешает создание и правку (@Roles). У оператора
  // пункт не показывается, а RoleGuard закрывает и прямой заход по URL.
  { to: '/routes', label: 'Маршруты', icon: '🗺️', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tech-cards', label: 'Техкарты', icon: '🧾', roles: ['ADMIN', 'SUPERVISOR'] },
  // Шаблоны: демо-заготовки техкарт/маршрутов/объектов. Создание из шаблона
  // ходит в те же POST, что и обычные экраны, — виден ролям с правом создания.
  { to: '/templates', label: 'Шаблоны', icon: '📚', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tickets', label: 'Заявки', icon: '🎫' },
  // Карта — геозоны объектов и ближние сотрудники: чтение gps-service открыто
  // всем авторизованным ролям, поэтому пункт виден без ограничения по ролям.
  { to: '/map', label: 'Карта', icon: '📍' },
  { to: '/employees', label: 'Сотрудники', icon: '👥', roles: ['ADMIN', 'SUPERVISOR'] },
  // Материалы (М4.3): чтение справочника, остатков, истории и отчёта в
  // material-service открыто всем авторизованным ролям, поэтому пункт виден без
  // ограничения по ролям. Правка справочника (ADMIN/SUPERVISOR) и движения
  // (ADMIN/SUPERVISOR/OPERATOR) скрыты внутри экрана по правам.
  { to: '/materials', label: 'Материалы', icon: '📦' },
  // Графики и смены (М4.6): чтение графиков, смен дня и своих смен открыто всем
  // авторизованным ролям (на GET в schedule-service нет `@Roles`), поэтому пункт
  // виден без ограничения по ролям. Правка графиков, ручные триггеры генерации и
  // неявок и отметка прихода/ухода скрыты внутри экрана по правам.
  { to: '/schedule', label: 'Графики и смены', icon: '🗓️' },
  // Сообщения (М5.3): чаты текущего пользователя. Доступ ограничен на сервере
  // участием в чате (чужие чаты → 403), поэтому пункт виден всем ролям.
  { to: '/messages', label: 'Сообщения', icon: '💬' },
  { to: '/reports', label: 'Отчёты', icon: '📈' },
];

/**
 * Пункты, доступные роли. Единственный фильтр в приложении: сайдбар, drawer и
 * нижняя навигация получают уже отфильтрованный список, а не повторяют условие
 * по `roles` — иначе права ролей разъехались бы между тремя поверхностями.
 */
export function navForRole(role: Role | undefined): NavItem[] {
  return NAV.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)));
}

/**
 * Каркас админки в трёх диапазонах ширины (контракт брейкпоинтов — System Design
 * §2.2, дефолтные `screens` Tailwind: `md` = 768, `lg` = 1024):
 *
 * - **desktop ≥1024 px** — сайдбар `w-60` с подписями, шапка `px-6`, контент
 *   `p-6`: вид не меняется относительно прежней версии каркаса;
 * - **tablet 768–1023 px** — тот же `<aside>` сжимается в иконочную рейку
 *   `w-16` (ADR-003): подписи скрыты, у пунктов остаются `title`/`aria-label`;
 * - **phone <768 px** — сайдбар скрыт, навигация через бургер → `MobileDrawer`
 *   (полный ролевой список) и нижнюю навигацию из 5 слотов (`BottomNav`).
 *
 * Правило диапазонов: `md:` = «планшет и выше», поэтому «только телефон» — это
 * `max-md:`, «только планшет» — `md:max-lg:`. Все классы, отличающие новый каркас
 * от прежнего, ограничены диапазоном: безусловных правил, меняющих вид desktop,
 * здесь нет (§2.3 п.5 System Design).
 */
export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const toggleDrawer = useUiStore((s) => s.toggleDrawer);
  const closeAll = useUiStore((s) => s.closeAll);
  // `md` (768 px) — граница, на которой drawer заменяется рейкой/сайдбаром.
  const isTabletOrWider = useMediaQuery('(min-width: 768px)');

  const items = navForRole(user?.role);

  // Смена маршрута закрывает drawer: пункт меню мог быть выбран в drawer,
  // а мог быть достигнут программным `navigate` (кнопка «назад», редирект
  // RoleGuard) — в обоих случаях меню поверх нового экрана лишнее.
  useEffect(() => {
    closeAll();
  }, [location.pathname, closeAll]);

  // Переход через 768 px (поворот планшета, ресайз окна): при ширине ≥768
  // навигацию несёт рейка/сайдбар, и оставшийся открытым drawer «залипал» бы
  // поверх них. При возврате на <768 drawer по умолчанию закрыт — ничего не делаем.
  useEffect(() => {
    if (isTabletOrWider) closeAll();
  }, [isTabletOrWider, closeAll]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Один `<aside>` на три диапазона (а не три разных макета): на телефоне
          скрыт, на планшете — рейка w-16, на desktop — прежние w-60 с подписями. */}
      <aside
        data-testid="admin-sidebar"
        className="hidden shrink-0 bg-neutral-900 text-neutral-100 md:flex md:w-16 md:flex-col lg:w-60"
      >
        <div className="flex h-16 items-center gap-2 px-4 text-lg font-semibold text-primary-300 md:max-lg:justify-center">
          {/* На рейке w-16 места для названия нет — остаётся только знак; текст
              не дублируется, а скрывается, чтобы на desktop разметка и вид
              остались прежними. */}
          <span className="md:max-lg:hidden">🧹 Cleaning Ops</span>
          <span aria-hidden="true" className="hidden md:max-lg:inline">
            🧹
          </span>
        </div>
        {/* На планшете отступ рейки уменьшается (`p-2` вместо `p-3`), чтобы в её
            64 px умещался тач-таргет 44 px: с прежними 12 px по бокам на пункт
            оставалось 40 px. `items-center` там же центрирует укороченный пункт
            (44 в 48 px контента → ровно по оси рейки), а на desktop отступ и
            растягивание пунктов остаются прежними. */}
        <nav className="flex flex-col gap-1 p-3 md:max-lg:items-center md:max-lg:p-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // title/aria-label — для рейки: подпись там скрыта, и без них пункт
              // остался бы безымянным для скринридера и без подсказки при наведении.
              // aria-label задаёт точное доступное имя («Объекты», а не «🏢 Объекты»).
              title={item.label}
              aria-label={item.label}
              // На планшете рейка — основной способ ввода пальцем, поэтому пункт
              // доводится до тач-таргета 44×44 (`min-h`/`min-w` только в диапазоне
              // `md:max-lg:`). На desktop эти классы не действуют: там пункт
              // остаётся прежним — высота 36 px, подпись на прежнем месте.
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 justify-center rounded-md px-3 py-2 text-sm transition-colors md:max-lg:min-h-[44px] md:max-lg:min-w-[44px] md:max-lg:px-2 lg:justify-start',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
                ].join(' ')
              }
            >
              {/* Иконка нужна только планшетной рейке: на desktop пункт выглядит
                  ровно как прежде — подписью без эмодзи (§2.3 п.5). */}
              <span aria-hidden="true" className="hidden text-base leading-none md:max-lg:inline">
                {item.icon}
              </span>
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Бургер есть только на телефоне: на планшете и desktop навигация
                видна постоянно, открывать её нечем и незачем. */}
            <button
              type="button"
              data-testid="nav-burger"
              onClick={toggleDrawer}
              aria-label="Открыть меню"
              aria-expanded={drawerOpen}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 md:hidden"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ☰
              </span>
            </button>
            <div className="truncate text-sm text-neutral-500">Web Admin</div>
          </div>
          <div className="flex items-center gap-4">
            {/* In-app уведомления (М3.7): счётчик непрочитанных + выпадающий список. */}
            <NotificationBell />
            {user && (
              // На самых узких телефонах имя и роль уступают место навигации и
              // кнопке выхода; на ≥640 px блок показывается как раньше.
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium text-neutral-800">{user.fullName}</div>
                <div className="text-xs text-neutral-500">{user.role}</div>
              </div>
            )}
            {/* Выход обязан оставаться доступным и на телефоне, поэтому тач-таргет
                поднимается до 44 px на телефонном и планшетном диапазонах (`max-lg:`);
                на desktop класс не действует — вид кнопки прежний. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="max-lg:min-h-[44px] max-lg:min-w-[44px]"
            >
              Выйти
            </Button>
          </div>
        </header>
        {/* Отступы: телефон p-4, планшет p-5, desktop p-6 (как было). Нижний
            отступ телефона — под фиксированную нижнюю навигацию плюс системную
            полосу жестов; на ≥768 px его перекрывает `md:p-5`/`lg:p-6`. */}
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>

      <BottomNav items={items} />
      <MobileDrawer items={items} user={user} />
    </div>
  );
}
