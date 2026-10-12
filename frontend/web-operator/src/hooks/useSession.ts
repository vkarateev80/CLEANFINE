import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import type { SessionUser } from '../types';

export interface SessionState {
  user: SessionUser | null;
  /** Токен есть, профиль ещё не получен. */
  isLoading: boolean;
  /** `/auth/me` не ответил (сеть или отозванная сессия). */
  isError: boolean;
  refetch: () => void;
}

/**
 * Текущая сессия. Профиль нужен guard'у ролей; после перезагрузки страницы он
 * уже лежит в localStorage (его кладёт `login()`), поэтому запрос уходит только
 * если профиля нет — так PWA открывается без сети, если сессия была сохранена.
 */
export function useSession(): SessionState {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey: ['session', 'me'],
    queryFn: fetchMe,
    enabled: Boolean(accessToken) && !user,
    staleTime: Infinity,
    retry: false,
  });

  return {
    user,
    isLoading: Boolean(accessToken) && !user && query.isLoading,
    isError: Boolean(accessToken) && !user && query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
