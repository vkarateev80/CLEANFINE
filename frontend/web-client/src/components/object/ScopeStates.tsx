import type { ReactNode } from 'react';
import { logout } from '../../api/auth';
import { useObjectScopeContext } from './ObjectScopeContext';
import { Button } from '../ui/Button';
import { EmptyState, ErrorBanner, LoadingBlock, SoftWarning } from '../ui/Feedback';

/**
 * Состояния доступа к объекту — один набор экранов на весь портал.
 *
 * Правило DS-004 (`overview.md` п. 5 и `dashboard.md` п. 6): **403 — это не
 * «ошибка сети»**. Чужой объект и отсутствие привязки показываются отдельными
 * экранами без кнопки «Повторить» (повтор не изменит ответ), а сетевой сбой —
 * баннером с повтором. Смешивать их нельзя: клиент начнёт «повторять» то, что
 * повторять бессмысленно, вместо обращения к менеджеру.
 */
export function AccessDeniedScreen() {
  return (
    <div className="flex flex-col gap-3" data-testid="portal-forbidden">
      <EmptyState
        title="Нет доступа к объекту"
        hint="Портал показывает данные только по вашему объекту. Обратитесь к менеджеру."
        action={
          <Button variant="secondary" className="min-h-[44px]" onClick={() => void logout()}>
            Выйти
          </Button>
        }
      />
      <SoftWarning>Данные доступны только по вашему объекту.</SoftWarning>
    </div>
  );
}

/**
 * Объект не привязан к учётной записи: у аккаунта нет ни одного объекта с
 * `ownerClientId`, равным id пользователя. Привязка — явная и выполняется
 * менеджером в админке; сопоставления по названию организации в портале нет.
 */
export function ObjectNotAssignedScreen() {
  return (
    <div className="flex flex-col gap-3" data-testid="portal-forbidden">
      <EmptyState
        title="Объект не подключён"
        hint="Ваша учётная запись ещё не связана с объектом обслуживания. Обратитесь к менеджеру — он привяжет объект к вашей учётной записи."
        action={
          <Button variant="secondary" className="min-h-[44px]" onClick={() => void logout()}>
            Выйти
          </Button>
        }
      />
      <SoftWarning>Данные доступны только по вашему объекту.</SoftWarning>
    </div>
  );
}

export function ScopeErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <ErrorBanner error={error} onRetry={onRetry} />
      <p className="text-xs text-neutral-500">
        Не удалось получить список объектов. Проверьте соединение — данные объекта появятся после
        успешного запроса.
      </p>
    </div>
  );
}

/**
 * Пропускает содержимое экрана, только когда объект определён. Для экранов,
 * которые без объекта бессмысленны (`/dashboard`, `/tickets`, `/reports`).
 *
 * `/chat` этот гейт не использует: переписка с менеджером нужна и тогда, когда
 * объект ещё не привязан — это единственный канал связи в портале.
 */
export function ScopeGate({ children }: { children: ReactNode }) {
  const scope = useObjectScopeContext();

  switch (scope.state) {
    case 'ready':
      return <>{children}</>;
    case 'loading':
      return <LoadingBlock label="Загрузка объекта…" />;
    case 'forbidden':
      return <AccessDeniedScreen />;
    case 'unassigned':
      return <ObjectNotAssignedScreen />;
    case 'error':
      return <ScopeErrorScreen error={scope.error} onRetry={scope.refetch} />;
    default:
      return null;
  }
}
