import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { logout } from '../api/auth';
import { Button } from '../components/ui/Button';
import { NotificationBell } from '../pages/Notifications/NotificationBell';
import { useAuthStore } from '../stores/authStore';

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Дашборд', end: true },
  { to: '/objects', label: 'Объекты' },
  // Маршруты и техкарты — рабочие места ADMIN/SUPERVISOR: ровно те роли,
  // которым core-service разрешает создание и правку (@Roles). У оператора
  // пункт не показывается, а RoleGuard закрывает и прямой заход по URL.
  { to: '/routes', label: 'Маршруты', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tech-cards', label: 'Техкарды', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tickets', label: 'Заявки' },
  // Карта — геозоны объектов и ближние сотрудники: чтение gps-service открыто
  // всем авторизованным ролям, поэтому пункт виден без ограничения по ролям.
  { to: '/map', label: 'Карта' },
  { to: '/employees', label: 'Сотрудники', roles: ['ADMIN', 'SUPERVISOR'] },
  // Материалы (М4.3): чтение справочника, остатков, истории и отчёта в
  // material-service открыто всем авторизованным ролям, поэтому пункт виден без
  // ограничения по ролям. Правка справочника (ADMIN/SUPERVISOR) и движения
  // (ADMIN/SUPERVISOR/OPERATOR) скрыты внутри экрана по правам.
  { to: '/materials', label: 'Материалы' },
  // Графики и смены (М4.6): чтение графиков, смен дня и своих смен открыто всем
  // авторизованным ролям (на GET в schedule-service нет `@Roles`), поэтому пункт
  // виден без ограничения по ролям. Правка графиков, ручные триггеры генерации и
  // неявок и отметка прихода/ухода скрыты внутри экрана по правам.
  { to: '/schedule', label: 'Графики и смены' },
  // Сообщения (М5.3): чаты текущего пользователя. Доступ ограничен на сервере
  // участием в чате (чужие чаты → 403), поэтому пункт виден всем ролям.
  { to: '/messages', label: 'Сообщения' },
  { to: '/reports', label: 'Отчёты' },
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-60 shrink-0 bg-neutral-900 text-neutral-100">
        <div className="flex h-16 items-center gap-2 px-4 text-lg font-semibold text-primary-300">
          🧹 Cleaning Ops
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-primary-600 text-white' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
          <div className="text-sm text-neutral-500">Web Admin</div>
          <div className="flex items-center gap-4">
            {/* In-app уведомления (М3.7): счётчик непрочитанных + выпадающий список. */}
            <NotificationBell />
            {user && (
              <div className="text-right">
                <div className="text-sm font-medium text-neutral-800">{user.fullName}</div>
                <div className="text-xs text-neutral-500">{user.role}</div>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Выйти
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
