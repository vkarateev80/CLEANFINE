import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { useAuthStore } from '../../stores/authStore';

/** Ограничивает страницу по ролям (RBAC). */
export function RoleGuard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
