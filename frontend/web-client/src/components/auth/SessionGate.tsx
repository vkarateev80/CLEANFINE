import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';

/** Скелетон проверки сессии: держит высоту, чтобы вёрстка не «прыгала» на телефоне. */
function SessionSkeleton() {
  return (
    <div className="mx-auto flex max-w-screen-md flex-col gap-4 p-4" data-testid="portal-session-loading">
      <div className="h-6 w-2/3 animate-pulse rounded-md bg-neutral-200" />
      <div className="h-24 animate-pulse rounded-xl bg-neutral-200" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-neutral-200" />
        <div className="h-20 animate-pulse rounded-xl bg-neutral-200" />
      </div>
    </div>
  );
}

/**
 * Сессия, проверенная перед монтированием каркаса.
 *
 * `useSession` сам по себе не блокирует рендер: `RoleGuard` без профиля вернул бы
 * `null`, и пользователь увидел бы пустой белый экран. Здесь ожидание явное —
 * скелетон на время проверки, экран отказа при недоступном auth-service.
 *
 * Разлогинивать молча нельзя: токен в localStorage есть, и «выкинуло» без
 * объяснения выглядит как поломка портала. Поэтому предлагаем повторить.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { user, isLoading, isError, refetch } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  if (!accessToken) {
    return <>{children}</>;
  }
  if (isLoading) {
    return <SessionSkeleton />;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md p-4">
        <EmptyState
          title={isError ? 'Не удалось проверить сессию' : 'Сессия истекла'}
          hint={
            isError
              ? 'Сервис авторизации не ответил. Проверьте соединение и повторите попытку.'
              : 'Войдите заново, чтобы продолжить работу.'
          }
          action={
            <div className="flex w-full flex-col gap-2">
              {isError && (
                <Button
                  variant="primary"
                  className="min-h-[44px]"
                  onClick={() => refetch()}
                  data-testid="portal-session-retry"
                >
                  Повторить
                </Button>
              )}
              <Button variant="secondary" className="min-h-[44px]" onClick={logout}>
                Выйти
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
