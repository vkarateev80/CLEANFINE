import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Кнопки действий внизу; если не переданы — модалка только с содержимым. */
  footer?: ReactNode;
  /** `lg` — для форм с несколькими колонками (объект, операция). */
  size?: 'md' | 'lg';
  /** Пока идёт запрос, закрытие по Esc/оверлею блокируется. */
  busy?: boolean;
}

const SIZES = { md: 'max-w-lg', lg: 'max-w-3xl' } as const;

/**
 * Модальное окно по DS-003: затемнение `bg-neutral-900/60`, панель `rounded-xl
 * bg-white shadow-xl`. Закрывается по Esc и клику по оверлею — но не во время
 * запроса: иначе пользователь закроет форму, не увидев ошибку сохранения.
 */
export function Modal({ open, title, onClose, children, footer, size = 'md', busy }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/60 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={['mt-12 w-full rounded-xl bg-white p-6 shadow-xl', SIZES[size]].join(' ')}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy} aria-label="Закрыть">
            ✕
          </Button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` — для удаления: красная кнопка подтверждения. */
  variant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Диалог подтверждения — общий для всех удалений и необратимых действий. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  variant = 'danger',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-neutral-600">{message}</div>
    </Modal>
  );
}
