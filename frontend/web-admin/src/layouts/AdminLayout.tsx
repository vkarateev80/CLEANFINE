import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { logout } from '../api/auth';
import { Button } from '../components/ui/Button';
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
  { to: '/routes', label: 'Маршруты', roles: ['ADMIN'] },
  { to: '/tickets', label: 'Заявки' },
  { to: '/employees', label: 'Сотрудники', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/materials', label: 'Материалы' },
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
