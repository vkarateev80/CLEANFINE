import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { isOperatorRole } from './RoleGuard';
import { useAuthStore } from '../../stores/authStore';

/** Уже вошедший оператор не должен «застревать» на форме входа. */
export function PublicOnlyGuard({ children }: { children: ReactElement }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (accessToken && user && isOperatorRole(user.role)) {
    return <Navigate to="/today" replace />;
  }
  return children;
}
