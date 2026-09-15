import { useState } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, SoftWarning } from '../../components/ui';
import { PlanDropZone } from './PlanDropZone';
import { PLAN_FORMATS_HINT } from './floorPlanUtils';

interface PlanUploadModalProps {
  open: boolean;
  /** Сколько помещений уже имеют координаты — предупреждаем о смене изображения. */
  roomsWithCoords: number;
  planScale: number | null;
  busy: boolean;
  error: unknown;
  onSubmit: (file: File, scale: number | null) => void;
  onAttachUrl: (url: string, scale: number | null) => void;
  onClose: () => void;
}

function parseScale(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Загрузка/замена плана: multipart в core-service либо привязка уже загруженного URL. */
export function PlanUploadModal({
  open,
  roomsWithCoords,
  planScale,
  busy,
  error,
  onSubmit,
  onAttachUrl,
  onClose,
}: PlanUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState(planScale === null ? '' : String(planScale));
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    const parsed = parseScale(scale);
    if (scale.trim() !== '' && (parsed === null || parsed <= 0)) {
      setLocalError('Масштаб должен быть больше 0');
      return;
    }
    if (mode === 'url') {
      if (url.trim() === '') {
        setLocalError('Укажите URL файла плана');
        return;
      }
      setLocalError(null);
      onAttachUrl(url.trim(), parsed);
      return;
    }
    if (!file) {
      setLocalError('Выберите файл плана');
      return;
    }
    setLocalError(null);
    onSubmit(file, parsed);
  }

  return (
    <Modal
      open={open}
      title="План этажа"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            type="button"
            data-testid="floor-plan-upload-submit"
            loading={busy}
            onClick={handleSubmit}
          >
            {mode === 'url' ? 'Привязать' : 'Загрузить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {Boolean(error) && <ErrorBanner error={error} />}
        {localError && <ErrorBanner error={new Error(localError)} onRetry={() => setLocalError(null)} />}

        {roomsWithCoords > 0 && (
          <SoftWarning>
            Координаты {roomsWithCoords} помещений могут перестать соответствовать новому изображению.
          </SoftWarning>
        )}

        <div className="flex gap-2">
          <Button
            variant={mode === 'file' ? 'primary' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setMode('file')}
          >
            Файл
          </Button>
          <Button
            variant={mode === 'url' ? 'primary' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setMode('url')}
          >
            Уже загруженный URL
          </Button>
        </div>

        {mode === 'file' ? (
          <>
            <PlanDropZone
              testId="floor-plan-upload"
              disabled={busy}
              onInvalid={setLocalError}
              onFile={(next) => {
                setLocalError(null);
                setFile(next);
              }}
            />
            <div className="text-xs text-neutral-500">
              {file ? (
                <>
                  Выбран файл: <span className="font-mono">{file.name}</span>
                </>
              ) : (
                PLAN_FORMATS_HINT
              )}
            </div>
          </>
        ) : (
          <Field label="URL файла плана" htmlFor="plan-upload-url" hint="Ссылка из file-service">
            <Input
              id="plan-upload-url"
              value={url}
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
        )}

        <Field
          label="Масштаб, м/пкс"
          htmlFor="plan-upload-scale"
          hint="1 px ≈ 0.05 м; пусто — не менять"
        >
          <Input
            id="plan-upload-scale"
            type="number"
            step="0.001"
            min="0"
            className="font-mono"
            value={scale}
            disabled={busy}
            onChange={(event) => setScale(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
