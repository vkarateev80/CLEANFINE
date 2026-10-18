import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n';

/**
 * Нижняя шторка (bottom sheet) — на телефоне заменяет модальное окно: деталь
 * заявки, фото операции, причина пропуска, настройки уведомлений.
 * Закрывается кнопкой, тапом по подложке и Escape.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-neutral-900/40"
        aria-label={t('Закрыть')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="relative flex max-h-[90dvh] w-full max-w-screen-sm flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div
            className="mx-auto mb-1 h-1 w-10 rounded-full bg-neutral-300 sm:hidden"
            aria-hidden="true"
          />
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium text-neutral-900">{title}</h2>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
            aria-label={t('Закрыть')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="op-sheet-footer border-t border-neutral-200 px-4 pt-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
