import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import type { SessionUser } from '../types';

/**
 * Текущая сессия портала.
 *
 * `authStore` хранит токены и профиль в localStorage, но после перезагрузки
 * страницы профиль может отсутствовать (его туда кладёт `login()`), а
 * `RoleGuard` без профиля не может проверить роль. Поэтому сессия считается
 * «загруженной» только когда профиль есть: иначе запрашиваем `GET /api/auth/me`.
 *
 * Это тот же приём, что в админке, но там `me` вызывается на странице логина;
 * в портале роль — часть guard'а всего дерева маршрутов, поэтому запрос вынесен
 * в отдельный хук и вызывается один раз (`staleTime: Infinity`: профиль в рамках
 * сессии не меняется).
 */
export interface SessionState {
  user: SessionUser | null;
  /** Идёт первая проверка сессии (токен есть, профиль ещё не получен). */
  isLoading: boolean;
  /** `/auth/me` не ответил: интерцептор уже отработал refresh и разлогинил. */
  isError: boolean;
  refetch: () => void;
}

export function useSession(): SessionState {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey: ['session', 'me'],
    queryFn: fetchMe,
    // Без токена запрос бессмысленен: 401 сюда придёт раньше, чем интерцептор
    // поймёт, что обновлять нечего.
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
