import { Link } from 'react-router-dom';
import { useOnline } from '../../hooks/useOnline';
import { usePendingCount } from '../../stores/queueStore';
import { plural } from '../../lib/date';
import { t } from '../../i18n';

/**
 * Баннер связности (offline.md §2): показывается при оффлайне или непустой
 * очереди. Тап ведёт на экран очереди. `aria-live` — скринридер озвучит смену.
 */
export function OfflineBanner({
  text,
  testId = 'op-offline-banner',
}: {
  text?: string;
  testId?: string;
}) {
  const online = useOnline();
  const pending = usePendingCount();
  if (online && pending === 0) return null;

  const message = !online
    ? (text ?? t('Нет соединения — данные могут быть устаревшими'))
    : t('{count} {actions} отправки', {
        count: pending,
        actions: plural(pending, t('действие ждёт'), t('действия ждут'), t('действий ждут')),
      });

  return (
    <Link
      to="/offline"
      data-testid={testId}
      className="flex items-center gap-2 border-b border-warning-500 bg-white px-4 py-2 text-xs text-warning-600"
      aria-live="polite"
    >
      <span aria-hidden="true">⚠</span>
      <span className="min-w-0 flex-1">{message}</span>
      {pending > 0 && <span className="font-mono">⚡{pending}</span>}
    </Link>
  );
}
