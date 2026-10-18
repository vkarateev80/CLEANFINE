import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { t } from '../../i18n';

function SessionSkeleton() {
  return (
    <div
      className="mx-auto flex max-w-screen-md flex-col gap-4 p-4"
      data-testid="op-session-loading"
    >
      <div className="h-6 w-2/3 animate-pulse rounded-md bg-neutral-200" />
      <div className="h-36 animate-pulse rounded-xl bg-neutral-200" />
      <div className="h-36 animate-pulse rounded-xl bg-neutral-200" />
    </div>
  );
}

/**
 * Сессия проверяется до монтирования каркаса: без профиля RoleGuard вернул бы
 * пустой экран. При недоступном auth-service предлагаем повторить, а не
 * разлогиниваем молча — иначе «выкинуло» выглядит как поломка.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { user, isLoading, isError, refetch } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  if (!accessToken) return <>{children}</>;
  if (isLoading) return <SessionSkeleton />;
  if (!user) {
    return (
      <div className="mx-auto max-w-md p-4">
        <EmptyState
          title={isError ? t('Не удалось проверить сессию') : t('Сессия истекла')}
          hint={
            isError
              ? t('Сервис авторизации не ответил. Проверьте соединение и повторите попытку.')
              : t('Войдите заново, чтобы продолжить работу.')
          }
          action={
            <div className="flex w-full flex-col gap-2">
              {isError && (
                <Button variant="primary" className="min-h-[48px]" onClick={() => refetch()}>
                  {t('Повторить')}
                </Button>
              )}
              <Button variant="secondary" className="min-h-[48px]" onClick={logout}>
                {t('Выйти')}
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
