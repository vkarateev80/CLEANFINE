import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createEmergencyTicket } from '../../api/tickets';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import type { EmergencyTicketResult } from '../../types/tickets';
import { useObjectOptions } from './useTickets';

/**
 * Аварийная заявка (SOS, М3.5). Отдельная форма, потому что контракт другой:
 * `EmergencyTicketDto` требует координаты (`lat`/`lng` обязательны), приоритет
 * задаётся бэкендом (`critical`), а в ответе приходят ближние операторы.
 *
 * Координаты подставляются из карточки объекта, но их можно снять с устройства
 * (браузерный Geolocation API) — админка работает и по месту, и удалённо.
 */

interface FormState {
  objectId: string;
  description: string;
  lat: string;
  lng: string;
}

const INITIAL: FormState = { objectId: '', description: '', lat: '', lng: '' };

type Errors = Partial<Record<keyof FormState, string>>;

export function EmergencyTicketModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: EmergencyTicketResult) => void;
}) {
  const objects = useObjectOptions();
  const [values, setValues] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'denied'>('idle');

  const create = useMutation({
    mutationFn: createEmergencyTicket,
    onSuccess: (result) => onCreated(result),
  });

  const objectList = objects.data?.items ?? [];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    create.reset();
  }

  function handleObjectChange(objectId: string) {
    const object = objectList.find((item) => item.id === objectId);
    // Координаты объекта — разумное значение по умолчанию: SOS часто оформляют
    // диспетчеры, которые не находятся на месте аварии.
    setValues((current) => ({
      ...current,
      objectId,
      lat: object ? String(object.lat) : current.lat,
      lng: object ? String(object.lng) : current.lng,
    }));
    setErrors((current) => ({ ...current, objectId: undefined, lat: undefined, lng: undefined }));
    create.reset();
  }

  function useDeviceLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('denied');
      return;
    }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }));
        setErrors((current) => ({ ...current, lat: undefined, lng: undefined }));
        setGeoState('idle');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function handleSubmit() {
    const next: Errors = {};
    if (values.objectId === '') next.objectId = 'Выберите объект';
    const description = values.description.trim();
    if (description === '') next.description = 'Опишите аварию';

    const lat = Number(values.lat);
    if (values.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      next.lat = 'Широта — от −90 до 90';
    }
    const lng = Number(values.lng);
    if (values.lng.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      next.lng = 'Долгота — от −180 до 180';
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const object = objectList.find((item) => item.id === values.objectId);
    create.mutate({
      objectId: values.objectId,
      description,
      lat,
      lng,
      ...(object ? { objectName: object.name } : {}),
    });
  }

  function handleClose() {
    setValues(INITIAL);
    setErrors({});
    setGeoState('idle');
    create.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      title="🚨 Аварийная заявка (SOS)"
      size="lg"
      busy={create.isPending}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={create.isPending}>
            Отмена
          </Button>
          <Button
            variant="danger"
            data-testid="emergency-submit"
            loading={create.isPending}
            onClick={handleSubmit}
          >
            Отправить SOS
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-danger-500 bg-white px-4 py-3 text-sm text-danger-600">
          Заявка создаётся с приоритетом «Критичный» от имени текущего пользователя. Сервис
          уведомлений разошлёт SOS операторам, бригадирам и админам; gps-service подберёт ближних
          операторов к указанным координатам.
        </div>

        {create.error ? <ErrorBanner error={create.error} /> : null}

        <Field label="Объект" htmlFor="emergency-object" required error={errors.objectId}>
          <Select
            id="emergency-object"
            data-testid="emergency-object"
            value={values.objectId}
            invalid={Boolean(errors.objectId)}
            disabled={objects.isLoading}
            onChange={(event) => handleObjectChange(event.target.value)}
          >
            <option value="">{objects.isLoading ? 'Загрузка…' : 'Выберите объект'}</option>
            {objectList.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Что случилось"
          htmlFor="emergency-description"
          required
          error={errors.description}
          hint="Например: «Прорыв трубы в санузле на 3 этаже»"
        >
          <Textarea
            id="emergency-description"
            data-testid="emergency-description"
            value={values.description}
            maxLength={2000}
            invalid={Boolean(errors.description)}
            onChange={(event) => update('description', event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Широта" htmlFor="emergency-lat" required error={errors.lat}>
            <Input
              id="emergency-lat"
              className="font-mono"
              inputMode="decimal"
              value={values.lat}
              invalid={Boolean(errors.lat)}
              onChange={(event) => update('lat', event.target.value)}
            />
          </Field>
          <Field label="Долгота" htmlFor="emergency-lng" required error={errors.lng}>
            <Input
              id="emergency-lng"
              className="font-mono"
              inputMode="decimal"
              value={values.lng}
              invalid={Boolean(errors.lng)}
              onChange={(event) => update('lng', event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            loading={geoState === 'loading'}
            onClick={useDeviceLocation}
          >
            📍 Мои координаты
          </Button>
          {geoState === 'denied' && (
            <span className="text-xs text-danger-600">
              Геолокация недоступна — введите координаты вручную
            </span>
          )}
          <span className="text-xs text-neutral-500">
            По умолчанию подставлены координаты объекта — их можно уточнить.
          </span>
        </div>
      </div>
    </Modal>
  );
}
