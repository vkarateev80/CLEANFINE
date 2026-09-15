import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, Select } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { RoomEntity } from '../../types/core';
import { floorTypeLabel, inputToTime, zoneLabel } from './helpers';

/**
 * Модалка «Добавить помещение в маршрут».
 *
 * Список помещений — только своего этажа (бэкенд отвергает чужой этаж 400).
 * Помещения, уже добавленные в маршрут, показываются, но недоступны: повторное
 * добавление разрешено API, однако в конструкторе это всегда ошибка пользователя,
 * и «тихо продублировать» точку хуже, чем объяснить причину.
 */

export interface AddPointModalProps {
  open: boolean;
  rooms: RoomEntity[];
  roomsLoading: boolean;
  roomsError: unknown;
  /** id помещений, уже стоящих в маршруте. */
  usedRoomIds: Set<string>;
  /** Позиция вставки: в конец или после выбранной точки. */
  insertOptions: Array<{ id: string; label: string }>;
  defaultAfterId: string | null;
  busy: boolean;
  error: unknown;
  onRetryRooms: () => void;
  onClose: () => void;
  onSubmit: (payload: { roomId: string; estimatedTimeMin: number | undefined; afterId: string | null }) => void;
}

export function AddPointModal({
  open,
  rooms,
  roomsLoading,
  roomsError,
  usedRoomIds,
  insertOptions,
  defaultAfterId,
  busy,
  error,
  onRetryRooms,
  onClose,
  onSubmit,
}: AddPointModalProps) {
  const [search, setSearch] = useState('');
  const [roomId, setRoomId] = useState('');
  const [time, setTime] = useState('');
  const [afterId, setAfterId] = useState<string>('');
  const [touched, setTouched] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  // `defaultAfterId` читается через ref: он приходит от выбранной в списке точки
  // и меняется на каждый клик, а сброс формы должен происходить только при открытии.
  const defaultAfterIdRef = useRef(defaultAfterId);
  defaultAfterIdRef.current = defaultAfterId;

  // Каждое открытие — новая попытка: остатки прошлого выбора сбивали бы с толку.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setRoomId('');
    setTime('');
    setAfterId(defaultAfterIdRef.current ?? '');
    setTouched(false);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (needle.length === 0) return rooms;
    return rooms.filter((room) => {
      const haystack = `${room.name} ${room.zone ?? ''} ${room.floorType}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [rooms, debouncedSearch]);

  const parsedTime = inputToTime(time);
  const timeInvalid = touched && parsedTime === undefined;
  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;
  const roomInvalid = touched && roomId === '';

  function handleSubmit() {
    setTouched(true);
    if (roomId === '' || parsedTime === undefined) return;
    onSubmit({
      roomId,
      estimatedTimeMin: parsedTime === null ? undefined : parsedTime,
      afterId: afterId === '' ? null : afterId,
    });
  }

  return (
    <Modal
      open={open}
      title="Добавить помещение в маршрут"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="route-point-submit"
            onClick={handleSubmit}
            loading={busy}
            disabled={rooms.length === 0}
          >
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="route-point-form">
        {error !== null && <ErrorBanner error={error} />}
        {roomsError !== null && <ErrorBanner error={roomsError} onRetry={onRetryRooms} />}

        <Field label="Поиск помещения" htmlFor="add-point-search">
          <Input
            id="add-point-search"
            value={search}
            placeholder="Название, зона или тип"
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>

        <Field
          label="Помещение"
          htmlFor="add-point-room"
          required
          error={roomInvalid ? 'Выберите помещение' : null}
          hint={
            roomsLoading
              ? 'Загрузка помещений этажа…'
              : `Доступно ${rooms.length - usedRoomIds.size} из ${rooms.length} помещений этажа`
          }
        >
          <Select
            id="add-point-room"
            value={roomId}
            invalid={roomInvalid}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="">— выберите помещение —</option>
            {filtered.map((room) => {
              const used = usedRoomIds.has(room.id);
              return (
                <option key={room.id} value={room.id} disabled={used}>
                  {room.name} · {zoneLabel(room)}
                  {used ? ' — уже в маршруте' : ''}
                </option>
              );
            })}
          </Select>
        </Field>

        {rooms.length === 0 && !roomsLoading && (
          <div className="rounded-md border border-dashed border-neutral-300 p-3 text-xs text-neutral-400">
            На этаже нет помещений — сначала нарисуйте их на плане этажа.
          </div>
        )}

        {filtered.length === 0 && rooms.length > 0 && (
          <div className="text-xs text-neutral-400">По запросу «{debouncedSearch}» помещений не найдено.</div>
        )}

        <Field
          label="Оценка времени, мин"
          htmlFor="add-point-time"
          error={timeInvalid ? 'Целое число от 1' : null}
          hint="Необязательно: без значения точка считается без нормы времени"
        >
          <Input
            id="add-point-time"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={time}
            invalid={timeInvalid}
            onChange={(event) => setTime(event.target.value)}
            className="font-mono"
          />
        </Field>

        <Field label="Позиция" htmlFor="add-point-after" hint="Точка встанет в конец или сразу после выбранной">
          <Select id="add-point-after" value={afterId} onChange={(event) => setAfterId(event.target.value)}>
            <option value="">в конец маршрута</option>
            {insertOptions.map((option) => (
              <option key={option.id} value={option.id}>
                после: {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {selectedRoom && (
          <div className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
            {selectedRoom.name} · {zoneLabel(selectedRoom)} · {floorTypeLabel(selectedRoom)} ·{' '}
            {selectedRoom.areaM2} м²
            {selectedRoom.techCardId === null && (
              <span className="text-warning-600"> · техкарта не привязана</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
