import { Button } from './Button';
import { Sheet } from './Sheet';

/** Подтверждение необратимого действия («Закрыть смену?», «Выйти из аккаунта?»). */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel = 'Отмена',
  danger,
  loading,
  onConfirm,
  onCancel,
  testId,
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onCancel}
      testId={testId}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="min-h-[48px]"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className="min-h-[48px]"
            onClick={onConfirm}
            loading={loading}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {text && <p className="text-sm text-neutral-700">{text}</p>}
    </Sheet>
  );
}
