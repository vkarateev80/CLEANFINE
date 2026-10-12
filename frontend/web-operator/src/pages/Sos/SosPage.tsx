import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { attachFile, uploadPhoto } from '../../api/files';
import { createEmergency } from '../../api/tickets';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, errorMessage } from '../../components/ui/Feedback';
import { Field, Select, Textarea } from '../../components/ui/Input';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import {
  formatCoords,
  getCurrentPosition,
  LocationUnavailable,
  type GeoPoint,
} from '../../lib/geo';
import { apiStatus } from '../../lib/http';
import {
  PhotoTooSmall,
  preparePhoto,
  revokePhotoPreview,
  type PreparedPhoto,
} from '../../lib/photo';
import { savePhoto } from '../../lib/photoStore';
import { useAuthStore } from '../../stores/authStore';
import { isNetworkError, useNetStore } from '../../stores/netStore';
import { useQueueStore } from '../../stores/queueStore';
import { showToast } from '../../stores/uiStore';
import { plural } from '../../lib/date';
import { pickCurrentEvent, useTodayEvents } from '../Today/useToday';

/** Словарь типов аварии — в API его нет (sos.md п. 11.1): тип уходит префиксом описания. */
export const EMERGENCY_TYPES = [
  'Прорыв трубы / затопление',
  'Засор канализации',
  'Нет электричества',
  'Повреждение имущества',
  'Опасность для людей',
  'Другое',
] as const;

export const SOS_VALIDATION_TEXT = 'Выберите тип и сделайте фото';
const DESCRIPTION_MAX = 2000;

export function buildSosDescription(type: string, description: string): string {
  return `[Тип: ${type}] ${description.trim()}`;
}

interface SuccessState {
  queued: boolean;
  nearby: number;
  photoAttached: boolean;
}

/** Аварийная заявка (sos.md): тип, фото, описание, координаты → три запроса или очередь. */
export function SosPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const events = useTodayEvents();
  const current = useMemo(() => pickCurrentEvent(events.data ?? []), [events.data]);
  const online = useNetStore((s) => s.online);
  const userName = useAuthStore((s) => s.user?.fullName);
  const enqueue = useQueueStore((s) => s.enqueue);

  const objectId = params.get('objectId') ?? current?.objectId ?? null;
  const objectName = current?.objectName ?? undefined;
  const roomId = params.get('roomId') ?? undefined;
  const roomLabel = params.get('roomLabel') ?? undefined;

  const [type, setType] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = type !== '' || photo !== null || description.trim() !== '';

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      setLocation(await getCurrentPosition(10_000));
    } catch (error) {
      setLocationError(
        error instanceof LocationUnavailable
          ? error.message
          : 'Не удалось определить местоположение',
      );
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    void locate();
  }, []);

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const prepared = await preparePhoto(file);
      revokePhotoPreview(photo);
      setPhoto(prepared);
      setFormError(null);
    } catch (error) {
      showToast(
        error instanceof PhotoTooSmall ? error.message : 'Не удалось обработать фото',
        'error',
      );
    }
  }

  async function submit() {
    if (!type || !photo) {
      setFormError(SOS_VALIDATION_TEXT);
      showToast(SOS_VALIDATION_TEXT, 'error');
      return;
    }
    if (!description.trim()) {
      setFormError('Опишите аварию');
      return;
    }
    if (!objectId) return;
    if (!location) {
      setFormError(locationError ?? 'Определяем местоположение…');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const payload = {
      objectId,
      ...(roomId ? { roomId } : {}),
      description: buildSosDescription(type, description),
      lat: location.lat,
      lng: location.lng,
      ...(objectName ? { objectName } : {}),
      ...(roomLabel ? { floor: roomLabel } : {}),
      radiusM: 500,
    };
    const clientRequestId = crypto.randomUUID();

    const queue = async (extra: Record<string, unknown> = {}) => {
      await savePhoto(`sos:${clientRequestId}`, photo.blob);
      enqueue({
        kind: 'sos',
        payload: {
          ...payload,
          photoKey: `sos:${clientRequestId}`,
          takenAt: photo.takenAt,
          ...extra,
        },
        label: `Аварийная заявка · ${roomLabel ?? objectName ?? 'объект'}`,
        idempotencyKey: `sos:${clientRequestId}`,
      });
      setSuccess({ queued: true, nearby: 0, photoAttached: false });
    };

    try {
      if (!online) {
        await queue();
        return;
      }
      let fileId: string | null = null;
      try {
        const file = await uploadPhoto(photo.blob, `sos-${clientRequestId}.jpg`, {
          userName,
          takenAt: photo.takenAt,
          lat: location.lat,
          lng: location.lng,
        });
        fileId = file.id;
      } catch (error) {
        if (isNetworkError(error)) {
          await queue();
          return;
        }
        setFormError(`Фото отклонено: ${errorMessage(error)}. Снимите заново`);
        return;
      }
      let ticketId: string;
      let nearby = 0;
      try {
        const ticket = await createEmergency(payload);
        ticketId = ticket.id;
        nearby = ticket.nearbyOperators?.length ?? 0;
      } catch (error) {
        if (isNetworkError(error)) {
          await queue({ fileId });
          return;
        }
        const status = apiStatus(error);
        setFormError(
          status && status >= 500
            ? 'Сервис временно недоступен. Повторите позже'
            : `Ошибка: ${errorMessage(error)}`,
        );
        return;
      }
      let photoAttached = true;
      try {
        await attachFile(fileId, 'TICKET', ticketId);
      } catch {
        // Заявка уже создана — не «врём» о полном успехе, но и не считаем провалом.
        photoAttached = false;
      }
      setSuccess({ queued: false, nearby, photoAttached });
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (success || !dirty) {
      navigate('/today', { replace: true });
      return;
    }
    setConfirmCancel(true);
  }

  if (success) {
    return (
      <FullscreenLayout
        title="Аварийная заявка"
        tone="danger"
        showSos={false}
        onBack={() => navigate('/today', { replace: true })}
        testId="sos_success_view"
      >
        <div className="flex flex-col items-center gap-3 pt-8 text-center">
          <div className="text-5xl" aria-hidden="true">
            ✅
          </div>
          <h2 className="text-xl font-semibold text-success-600">
            {success.queued ? 'Заявка сохранена и будет отправлена' : 'Заявка отправлена'}
          </h2>
          <p className="text-sm text-neutral-700">Приоритет: Критичный · Статус: Новая</p>
          {!success.queued && (
            <p className="text-sm text-neutral-700" data-testid="sos_nearby_operators_text">
              Оповещены {success.nearby}{' '}
              {plural(success.nearby, 'оператор', 'оператора', 'операторов')} поблизости
            </p>
          )}
          {!success.queued && !success.photoAttached && (
            <p className="text-xs text-warning-600">
              Фото не прикреплено — прикрепится автоматически
            </p>
          )}
          {success.queued && (
            <p className="text-xs text-warning-600">Ожидает отправки — уйдёт при появлении сети</p>
          )}
          <Button
            variant="primary"
            className="mt-4 min-h-[48px] w-full max-w-xs"
            onClick={() => navigate('/today', { replace: true })}
            data-testid="sos_success_close_button"
          >
            Закрыть
          </Button>
        </div>
      </FullscreenLayout>
    );
  }

  if (events.isSuccess && !objectId) {
    return (
      <FullscreenLayout title="Аварийная заявка" tone="danger" showSos={false} backTo="/today">
        <EmptyState
          title="Не удалось определить объект. Начните смену."
          action={
            <Button variant="secondary" className="min-h-[48px]" onClick={() => navigate('/today')}>
              Назад
            </Button>
          }
        />
      </FullscreenLayout>
    );
  }

  return (
    <FullscreenLayout
      title="Аварийная заявка"
      tone="danger"
      showSos={false}
      onBack={handleBack}
      testId="sos_page"
      bottom={
        <Button
          variant="danger"
          className="min-h-[56px] w-full text-lg font-bold"
          loading={submitting}
          onClick={() => void submit()}
          data-testid="sos_submit_button"
        >
          🚨 ОТПРАВИТЬ SOS
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!online && (
          <div
            className="rounded-lg border border-warning-500 bg-white px-3 py-2 text-xs text-warning-600"
            data-testid="sos_offline_banner"
          >
            ⚠ Нет соединения — заявка уйдёт при появлении сети
          </div>
        )}
        {objectName && (
          <div className="text-sm text-neutral-500">
            Объект: {objectName}
            {roomLabel ? ` · ${roomLabel}` : ''}
          </div>
        )}

        <Field label="Тип аварии" htmlFor="sos_type" required>
          <Select
            id="sos_type"
            className="min-h-[48px] focus:border-danger-500 focus:ring-danger-500"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={submitting}
            data-testid="sos_type_dropdown"
          >
            <option value="">Выберите тип</option>
            {EMERGENCY_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-neutral-500">
            Фото <span className="text-danger-600">*</span>
          </span>
          {photo ? (
            <>
              <img
                src={photo.previewUrl}
                alt="Фото аварии"
                className="w-full rounded-md border border-neutral-200"
                data-testid="sos_photo_preview"
              />
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] self-start"
                onClick={() => fileInput.current?.click()}
                disabled={submitting}
                data-testid="sos_retake_photo_button"
              >
                Переснять
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="min-h-[48px] self-start"
              onClick={() => fileInput.current?.click()}
              disabled={submitting}
              data-testid="sos_photo_button"
            >
              📷 Сделать фото (обязательно)
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onFileChosen(e)}
            data-testid="sos_photo_input"
          />
        </div>

        <Field
          label="Описание"
          htmlFor="sos_description"
          required
          hint={
            description.length >= 1800 ? `${description.length} / ${DESCRIPTION_MAX}` : undefined
          }
        >
          <Textarea
            id="sos_description"
            rows={4}
            maxLength={DESCRIPTION_MAX}
            placeholder="Что случилось и где"
            className="focus:border-danger-500 focus:ring-danger-500"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            data-testid="sos_description_field"
          />
        </Field>

        <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-700">📍 Локация</span>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              onClick={() => void locate()}
              loading={locating}
              disabled={submitting}
            >
              Обновить
            </Button>
          </div>
          {location ? (
            <div className="mt-1 font-mono text-neutral-900" data-testid="sos_location_text">
              {formatCoords(location)}
              {roomLabel ? ` · ${roomLabel}` : ''}
            </div>
          ) : locating ? (
            <div className="mt-1 text-neutral-500" data-testid="sos_location_pending">
              Определяем местоположение…
            </div>
          ) : (
            <div className="mt-1 text-danger-600" data-testid="sos_location_error">
              {locationError ?? 'Нет доступа к геолокации. Включите GPS и повторите'}
            </div>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-danger-500 bg-white px-3 py-2 text-sm text-danger-600"
            data-testid="sos_error_text"
          >
            ⚠ {formError}
          </div>
        )}
        {!dirty && <p className="text-xs text-neutral-500">Заполните тип, фото и описание</p>}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Отменить заявку SOS?"
        text="Заполненные данные не сохранятся."
        confirmLabel="Отменить"
        cancelLabel="Продолжить заполнение"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          revokePhotoPreview(photo);
          navigate('/today', { replace: true });
        }}
      />
    </FullscreenLayout>
  );
}
