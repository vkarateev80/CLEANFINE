import { Link } from 'react-router-dom';
import { usePendingCount } from '../../stores/queueStore';
import { t } from '../../i18n';

/** Счётчик неотправленных действий в шапке; 0 — иконки нет (offline.md §2). */
export function SyncCounter({ testId = 'op-sync-status' }: { testId?: string }) {
  const pending = usePendingCount();
  if (pending === 0) return null;
  return (
    <Link
      to="/offline"
      data-testid={testId}
      className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-mono text-sm text-warning-600 hover:bg-neutral-100"
      aria-label={t('Неотправленных действий: {pending}', { pending })}
      title={t('Очередь отправки')}
    >
      <span aria-hidden="true">⚡</span>
      {pending}
    </Link>
  );
}
