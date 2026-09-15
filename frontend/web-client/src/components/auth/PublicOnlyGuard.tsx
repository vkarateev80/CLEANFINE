import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { PORTAL_ROLES } from './RoleGuard';
import { useAuthStore } from '../../stores/authStore';

/**
 * Обратный guard для `/login`: уже авторизованного пользователя портала нельзя
 * «застрять» на форме входа (DS-004, `login.md` п. 2).
 *
 * Сотрудник с чужой ролью остаётся на форме: у него нет доступа к порталу, и
 * редирект на `/dashboard` вернул бы его назад по кругу (`RoleGuard` → `/login`).
 */
export function PublicOnlyGuard({ children }: { children: ReactElement }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (accessToken && user && PORTAL_ROLES.includes(user.role as (typeof PORTAL_ROLES)[number])) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
