import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Button, ErrorBanner, Field, Input, Spinner } from '../../components/ui';
import type { FloorEntity } from '../../types/core';
import {
  PLAN_ACCEPT,
  apiMessages,
  formatBytes,
  formatScale,
  isImagePlan,
  parseOptionalNumber,
  planFileError,
} from './utils';

export interface UploadPlanModalProps {
  floor: FloorEntity;
  saving: boolean;
  /** Прогресс отправки файла 0–100; null — ещё не начата или уже на сервере. */
  progress?: number | null;
  error: unknown;
  onSubmit: (file: File, planScale?: number) => void;
  onCancel: () => void;
}

/**
 * Загрузка плана: drag-and-drop + выбор файла. Файл уходит одним multipart-запросом
 * в core-service, поэтому отдельно «выбрать и загрузить в file-service» не нужно.
 */
export function UploadPlanModal({
  floor,
  saving,
  progress = null,
  error,
  onSubmit,
  onCancel,
}: UploadPlanModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState(floor.planScale === null ? '' : String(floor.planScale));
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const previewable = file !== null && isImagePlan(file);

  // Object URL живёт до смены файла: без revoke браузер держит blob в памяти всё время сессии.
  useEffect(() => {
    if (!previewable || file === null) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, previewable]);

  function selectFile(candidate: File | undefined) {
    if (!candidate) return;
    const validationError = planFileError(candidate);
    setLocalError(validationError);
    setFile(validationError ? null : candidate);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file === null) {
      setLocalError('Выберите файл плана');
      return;
    }
    const parsedScale = parseOptionalNumber(scale);
    if (parsedScale !== undefined && (Number.isNaN(parsedScale) || parsedScale <= 0)) {
      setLocalError('Масштаб должен быть больше 0');
      return;
    }
    setLocalError(null);
    onSubmit(file, parsedScale);
  }

  const serverError = apiMessages(error).length > 0 ? error : null;
  const parsedScale = parseOptionalNumber(scale);
  const scaleHint =
    parsedScale !== undefined && !Number.isNaN(parsedScale) && parsedScale > 0
      ? `1 px ≈ ${formatScale(parsedScale)}`
      : 'Необязательно: можно указать позже';

  return (
    <form id="floor-plan-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
      {serverError ? <ErrorBanner error={serverError} /> : null}
      {localError ? <ErrorBanner error={new Error(localError)} /> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Выбрать файл плана"
        className={[
          'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-neutral-300 bg-neutral-50 hover:bg-neutral-100',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          data-testid="floor-plan-upload"
          type="file"
          accept={PLAN_ACCEPT}
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        {file === null ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Перетащите файл или выберите на диске
            </span>
            <span className="text-xs text-neutral-500">PNG, JPG, PDF, SVG — до 10 МБ</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-neutral-800">{file.name}</span>
            <span className="text-xs text-neutral-500">{formatBytes(file.size)}</span>
            {!previewable && (
              <span className="text-xs text-neutral-500">Предпросмотр недоступен</span>
            )}
          </div>
        )}
      </div>

      {previewUrl && (
        <img
          src={previewUrl}
          alt={`Предпросмотр плана: ${floor.name}`}
          className="max-h-48 w-full rounded-md border border-neutral-200 object-contain"
        />
      )}

      {/* Прогресс отправки (12.10.2026): на медленном канале файл идёт минуту и
          больше, без полосы казалось, что «ничего не происходит». */}
      {saving && (
        <div className="flex flex-col gap-1" data-testid="floor-plan-progress">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-primary-500 transition-[width]"
              style={{ width: `${progress ?? 100}%` }}
            />
          </div>
          <span className="text-xs text-neutral-500">
            {progress !== null && progress < 100
              ? `Отправка файла… ${progress} %`
              : 'Файл отправлен, сервер обрабатывает план…'}
          </span>
        </div>
      )}

      <Field label="Масштаб плана, м/пкс" htmlFor="upload-plan-scale" hint={scaleHint}>
        <Input
          id="upload-plan-scale"
          type="number"
          step="0.001"
          min={0}
          className="font-mono"
          value={scale}
          disabled={saving}
          onChange={(event) => setScale(event.target.value)}
        />
      </Field>

      {saving && (
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <Spinner />
          Загрузка плана…
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button variant="primary" type="submit" loading={saving} disabled={saving}>
          Загрузить
        </Button>
      </div>
    </form>
  );
}
