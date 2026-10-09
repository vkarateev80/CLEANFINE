import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/**
 * Роли рабочего места оператора (DS-002 overview.md п. 2): OPERATOR — целевая,
 * SUPERVISOR и ADMIN допущены (те же эндпоинты check-in и завершения операций).
 * CLIENT не пускается: его рабочее место — портал заказчика.
 */
export const OPERATOR_ROLES = ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const;

export function isOperatorRole(role: string): boolean {
  return (OPERATOR_ROLES as readonly string[]).includes(role);
}

export function RoleGuard({ children }: { children: ReactElement }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!isOperatorRole(user.role)) {
    return <Navigate to="/login" replace state={{ roleDenied: user.role }} />;
  }
  return children;
}
