import { useEffect, useState } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, SoftWarning } from '../../components/ui';
import { PlanDropZone } from './PlanDropZone';
import { PLAN_FORMATS_HINT, isSh3dFile } from './floorPlanUtils';
import { readSh3dScene, renderSh3dPlan, type ImportRoom, type RenderedPlan } from './sh3d';

interface PlanUploadModalProps {
  open: boolean;
  /** Сколько помещений уже имеют координаты — предупреждаем о смене изображения. */
  roomsWithCoords: number;
  planScale: number | null;
  busy: boolean;
  error: unknown;
  /**
   * Загрузка плана. Для .sh3d сюда приходит УЖЕ сконвертированный PNG
   * (файл, масштаб) и помещения файла — third-аргум создаётся после загрузки.
   */
  onSubmit: (file: File, scale: number | null, importRooms?: ImportRoom[]) => void;
  onAttachUrl: (url: string, scale: number | null) => void;
  onClose: () => void;
  /**
   * Файл, выбранный ВНЕ модалки (пустая зона загрузки на канвасе): модалка
   * открывается для .sh3d, чтобы показать конвертацию и спросить про импорт.
   * Модалка живёт один открытый сеанс (монтируется на время), поэтому
   * предзапуск — однократный эффект на маунте.
   */
  initialFile?: File | null;
}

function parseScale(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Результат конвертации .sh3d: PNG готов к multipart-загрузке. */
type Sh3dPreview = RenderedPlan;

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
  initialFile,
}: PlanUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState(planScale === null ? '' : String(planScale));
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [localError, setLocalError] = useState<string | null>(null);
  const [sh3d, setSh3d] = useState<Sh3dPreview | null>(null);
  const [sh3dBusy, setSh3dBusy] = useState(false);
  const [importRooms, setImportRooms] = useState(true);

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
    if (sh3dBusy) {
      setLocalError('Файл .sh3d ещё конвертируется — подождите');
      return;
    }
    if (sh3d) {
      setLocalError(null);
      onSubmit(sh3d.file, sh3d.scale, importRooms ? sh3d.rooms : []);
      return;
    }
    setLocalError(null);
    onSubmit(file, parsed);
  }

  /** Выбор файла: для .sh3d — конвертация в PNG до отправки (ошибки — сюда же). */
  async function handleFile(next: File) {
    setFile(next);
    setSh3d(null);
    setLocalError(null);
    if (!isSh3dFile(next)) return;
    setSh3dBusy(true);
    try {
      const scene = await readSh3dScene(next);
      const rendered = await renderSh3dPlan(next, scene);
      setSh3d(rendered);
      setScale(String(rendered.scale));
    } catch (caught) {
      setFile(null);
      setLocalError(caught instanceof Error ? caught.message : 'Не удалось разобрать .sh3d');
    } finally {
      setSh3dBusy(false);
    }
  }

  // Файл пришёл из пустой зоны на канвасе: прогоняем ту же конвертацию,
  // что и при выборе внутри модалки (эффект один — модалка монтируется заново).
  useEffect(() => {
    if (initialFile) void handleFile(initialFile);
    // eslint-disable-next-line -- см. комментарий выше: старт один на маунт
  }, []);

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
            loading={busy || sh3dBusy}
            onClick={handleSubmit}
          >
            {mode === 'url' ? 'Привязать' : 'Загрузить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {Boolean(error) && <ErrorBanner error={error} />}
        {localError && (
          <ErrorBanner error={new Error(localError)} onRetry={() => setLocalError(null)} />
        )}

        {roomsWithCoords > 0 && (
          <SoftWarning>
            Координаты {roomsWithCoords} помещений могут перестать соответствовать новому
            изображению.
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
              disabled={busy || sh3dBusy}
              onInvalid={setLocalError}
              onFile={(next) => {
                void handleFile(next);
              }}
            />
            <div className="text-xs text-neutral-500">
              {sh3dBusy ? (
                'Читаем .sh3d и рисуем план…'
              ) : file ? (
                <>
                  Выбран файл: <span className="font-mono">{file.name}</span>
                </>
              ) : (
                PLAN_FORMATS_HINT
              )}
            </div>

            {sh3d && (
              <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
                <div data-testid="sh3d-preview">
                  Sweet Home 3D → PNG {sh3d.width}×{sh3d.height} px · {sh3d.rooms.length} помещений
                  · масштаб {sh3d.scale.toFixed(5)} м/пкс
                </div>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    data-testid="sh3d-import-rooms"
                    checked={importRooms}
                    onChange={(event) => setImportRooms(event.target.checked)}
                  />
                  <span>
                    Создать помещения из файла ({sh3d.rooms.length}) — с названиями, площадью и
                    координатами на плане
                  </span>
                </label>
              </div>
            )}
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
          hint={
            sh3d
              ? 'Считается из геометрии .sh3d — изменить нельзя'
              : '1 px ≈ 0.05 м; пусто — не менять'
          }
        >
          <Input
            id="plan-upload-scale"
            type="number"
            step="0.00001"
            min="0"
            className="font-mono"
            value={scale}
            disabled={busy || sh3dBusy || Boolean(sh3d)}
            onChange={(event) => setScale(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
