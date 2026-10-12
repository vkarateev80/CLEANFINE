import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Toast } from '../components/ui/Toast';
import { OfflineBanner } from '../components/shell/OfflineBanner';
import { SyncCounter } from '../components/shell/SyncCounter';

/**
 * Полноэкранный маршрут поверх таб-бара (маршрут, чек-лист, SOS, очередь):
 * кнопка «назад», заголовок, иконка SOS, счётчик очереди; без таб-бара.
 */
export function FullscreenLayout({
  title,
  subtitle,
  backTo,
  onBack,
  tone = 'default',
  showSos = true,
  offlineText,
  children,
  bottom,
  testId,
}: {
  title: string;
  subtitle?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  tone?: 'default' | 'danger';
  showSos?: boolean;
  offlineText?: string;
  children: ReactNode;
  /** Фиксированная нижняя панель (кнопка «Завершить помещение», «Следующая точка»). */
  bottom?: ReactNode;
  testId?: string;
}) {
  const navigate = useNavigate();
  const danger = tone === 'danger';

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) navigate(backTo);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/today');
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-50" data-testid={testId}>
      <header
        className={['sticky top-0 z-20', danger ? 'bg-danger-500 text-white' : 'bg-white'].join(
          ' ',
        )}
      >
        <div
          className={[
            'flex min-h-14 items-center gap-1 px-2',
            danger ? '' : 'border-b border-neutral-200',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={goBack}
            className={[
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl',
              danger ? 'hover:bg-danger-600' : 'text-neutral-700 hover:bg-neutral-100',
            ].join(' ')}
            aria-label="Назад"
            data-testid="op-back"
          >
            ←
          </button>
          <div className="min-w-0 flex-1 py-2">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && (
              <div
                className={['truncate text-xs', danger ? 'text-white/80' : 'text-neutral-500'].join(
                  ' ',
                )}
              >
                {subtitle}
              </div>
            )}
          </div>
          {!danger && <SyncCounter />}
          {showSos && !danger && (
            <Link
              to="/sos"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl hover:bg-neutral-100"
              aria-label="Аварийная заявка SOS"
              data-testid="op-sos-icon"
            >
              🚨
            </Link>
          )}
        </div>
        {!danger && <OfflineBanner text={offlineText} />}
      </header>

      <main
        className={[
          'mx-auto w-full max-w-screen-md flex-1 p-4',
          bottom ? 'pb-32' : 'op-main-fullscreen',
        ].join(' ')}
      >
        {children}
      </main>

      {bottom && (
        <div className="op-bottom-bar fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white px-4 pt-3">
          <div className="mx-auto max-w-screen-md">{bottom}</div>
        </div>
      )}
      <Toast />
    </div>
  );
}
