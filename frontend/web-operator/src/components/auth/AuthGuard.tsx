import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/**
 * Пропускает только авторизованных пользователей (копия `web-admin`, приём
 * сохранён: неавторизованный уходит на `/login` с запоминанием исходного адреса,
 * чтобы после входа вернуться туда, куда шёл).
 */
export function AuthGuard({ children }: { children: ReactElement }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
