import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkIn, checkOut } from '../../api/schedule';
import { Button, ErrorBanner, Field, Input, Modal, SoftWarning } from '../../components/ui';
import type { ScheduleEventEntity } from '../../types/schedule';
import type { Coords } from './scheduleHelpers';
import { currentPosition, scheduleTime, timeZoneLabel } from './scheduleHelpers';

/**
 * Отметка смены: check-in (приход) и check-out (уход) одной модалкой.
 *
 * Почему отметка делается «за себя» и это подписано прямо в интерфейсе:
 * `/api/schedule/check-in` и `/check-out` берут пользователя из JWT
 * (`@CurrentUser`), а не из тела запроса, — отметить смену за другого сотрудника
 * через админку физически невозможно. Поэтому экран не притворяется, что умеет
 * выбирать исполнителя, а говорит об этом текстом: иначе администратор решил бы,
 * что отметил бригаду, и разошёлся бы с реальностью в отчётах.
 *
 * Координаты — из `navigator.geolocation`. Отказ в доступе не блокирует работу:
 * показываем причину и даём ввести широту/долготу руками (в бригадирском сценарии
 * это обычная ситуация — например, планшет с запрещённой геолокацией). Текст 403
 * «Вы находитесь вне зоны объекта» приходит с сервера и показывается как есть:
 * клиент не может знать геозону объекта.
 *
 * Check-out координаты не обязательны, но если браузер их отдал — отправляем:
 * по ним потом видно, где смена закрыта.
 */

/** Разобранные координаты или сообщение, почему их нет. */
type PositionState =
  | { kind: 'loading' }
  | { kind: 'ready'; coords: Coords; source: 'gps' | 'manual' }
  | { kind: 'failed'; message: string };

export function CheckInModal({
  open,
  mode,
  event,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: 'check-in' | 'check-out';
  event: ScheduleEventEntity;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [position, setPosition] = useState<PositionState>({ kind: 'loading' });
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Автозапрос координат при открытии. Модалка монтируется заново на каждую
  // отметку (`key` в панели), поэтому состояние геолокации не переезжает в
  // следующую смену.
  useEffect(() => {
    let alive = true;
    void currentPosition().then((result) => {
      if (!alive) return;
      if ('error' in result) {
        setPosition({ kind: 'failed', message: result.error });
      } else {
        setPosition({ kind: 'ready', coords: result, source: 'gps' });
        setLat(String(result.lat));
        setLng(String(result.lng));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = useMutation({
    mutationFn: () => {
      // Нечисловой ввод (пустая строка, «abc», «1,2,3») трактуем как «координат нет»:
      // для check-in это ошибка, которую ловит handleSubmit, для check-out — просто
      // запрос без координат. NaN в JSON превратился бы в null, и сервер молча принял
      // бы запрос без геоданных — снаружи это выглядело бы как «отметка без причины».
      const parsedLat = Number(lat.replace(',', '.'));
      const parsedLng = Number(lng.replace(',', '.'));
      const coords: Coords | null =
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        lat.trim() !== '' &&
        lng.trim() !== ''
          ? { lat: parsedLat, lng: parsedLng }
          : null;
      if (mode === 'check-in') {
        if (!coords) throw new Error('Укажите широту и долготу');
        return checkIn({ scheduleId: event.scheduleId, lat: coords.lat, lng: coords.lng });
      }
      return checkOut({
        scheduleId: event.scheduleId,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      const action = mode === 'check-in' ? 'Приход отмечен' : 'Уход отмечен';
      const at = mode === 'check-in' ? updated.checkInAt : updated.checkOutAt;
      onDone(
        `${action}: ${updated.scheduleName}, план ${scheduleTime(updated.plannedStart)} ${timeZoneLabel()}${at ? `, отметка ${scheduleTime(at)} ${timeZoneLabel()}` : ''}.`,
      );
    },
  });

  function handleSubmit() {
    setManualError(null);
    const parsedLat = Number(lat.replace(',', '.'));
    const parsedLng = Number(lng.replace(',', '.'));
    if (mode === 'check-in') {
      if (
        lat.trim() === '' ||
        lng.trim() === '' ||
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLng)
      ) {
        setManualError('Широта и долгота обязательны для отметки прихода');
        return;
      }
      if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
        setManualError('Широта — от −90 до 90, долгота — от −180 до 180');
        return;
      }
    }
    submit.mutate();
  }

  const title = mode === 'check-in' ? 'Отметить приход' : 'Отметить уход';
  const failure = submit.isError ? submit.error : null;

  return (
    <Modal
      open={open}
      title={title}
      busy={submit.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid={mode === 'check-in' ? 'checkin-submit' : 'checkout-submit'}
            loading={submit.isPending}
            onClick={handleSubmit}
          >
            {mode === 'check-in' ? 'Отметить приход' : 'Отметить уход'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SoftWarning>
          Отметка ставится <b>за вас</b> («{event.scheduleName}», план{' '}
          {scheduleTime(event.plannedStart)} {timeZoneLabel()}): сервис берёт пользователя из токена, отметить смену
          за другого сотрудника через админку нельзя.
        </SoftWarning>

        {failure ? <ErrorBanner error={failure} /> : null}

        {position.kind === 'loading' && (
          <p className="text-sm text-neutral-500">Запрашиваем координаты у браузера…</p>
        )}

        {position.kind === 'failed' && (
          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3">
            <span className="text-sm text-warning-600">{position.message}</span>
            <span className="text-xs text-neutral-500">
              Введите координаты вручную — сервер проверит их по геозоне объекта так же строго.
            </span>
          </div>
        )}

        {position.kind === 'ready' && (
          <p className="text-xs text-neutral-500">
            Координаты получены {position.source === 'gps' ? 'от браузера' : 'вручную'}. Изменить
            можно прямо здесь.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Широта"
            htmlFor="checkin-lat"
            required={mode === 'check-in'}
            error={manualError && mode === 'check-in' ? manualError : undefined}
          >
            <Input
              id="checkin-lat"
              data-testid="checkin-lat"
              className="font-mono"
              inputMode="decimal"
              value={lat}
              placeholder="55.7558"
              onChange={(eventChange) => {
                setLat(eventChange.target.value);
                setManualError(null);
              }}
            />
          </Field>
          <Field label="Долгота" htmlFor="checkin-lng" required={mode === 'check-in'}>
            <Input
              id="checkin-lng"
              data-testid="checkin-lng"
              className="font-mono"
              inputMode="decimal"
              value={lng}
              placeholder="37.6173"
              onChange={(eventChange) => {
                setLng(eventChange.target.value);
                setManualError(null);
              }}
            />
          </Field>
        </div>

        {mode === 'check-out' && (
          <p className="text-xs text-neutral-500">
            Для ухода координаты необязательны: пустые поля отправят запрос без них.
          </p>
        )}

        {/*
          Серверные тексты (403 «Вы находитесь вне зоны объекта», 400 «Смена не
          открыта: сначала выполните check-in», 404 и 502) показывает
          `ErrorBanner` выше ДОСЛОВНО: клиент не знает ни геозону объекта, ни
          состояние смены на стороне сервиса, и любая «своя» формулировка здесь
          вводила бы пользователя в заблуждение.
        */}
      </div>
    </Modal>
  );
}
