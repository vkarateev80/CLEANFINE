import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { localTime } from '../../lib/date';
import type { PreparedPhoto } from '../../lib/photo';
import { t } from '../../i18n';

/** Шторка после съёмки (checklist.md §2): превью, «Переснять», «Завершить операцию». */
export function PhotoSheet({
  photo,
  title,
  roomName,
  busy,
  onRetake,
  onConfirm,
  onClose,
}: {
  photo: PreparedPhoto | null;
  title: string;
  roomName: string;
  busy: boolean;
  onRetake: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={Boolean(photo)}
      title={title}
      onClose={onClose}
      testId="checklist_photo_sheet"
      footer={
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Button
            variant="secondary"
            className="min-h-[48px]"
            onClick={onRetake}
            disabled={busy}
            data-testid="checklist_retake_photo_button"
          >
            {t('Переснять')}
          </Button>
          <Button
            variant="primary"
            className="min-h-[48px]"
            onClick={onConfirm}
            loading={busy}
            data-testid="checklist_complete_with_photo_button"
          >
            {t('Завершить операцию')}
          </Button>
        </div>
      }
    >
      {photo && (
        <div className="flex flex-col gap-2">
          <img
            src={photo.previewUrl}
            alt={t('Фото операции')}
            className="w-full rounded-md border border-neutral-200"
            data-testid="checklist_photo_preview"
          />
          <p className="text-xs text-neutral-500">
            <span className="font-mono">{localTime(photo.takenAt)}</span> · {roomName} ·{' '}
            {t('водяной знак добавит сервер (имя, время, координаты)')}
          </p>
        </div>
      )}
    </Sheet>
  );
}
