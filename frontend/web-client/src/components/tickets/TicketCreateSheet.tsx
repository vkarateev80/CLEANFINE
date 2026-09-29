import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getObjectDetail } from '../../api/core';
import { createTicket } from '../../api/tickets';
import { Button } from '../ui/Button';
import { Field, Textarea, Select } from '../ui/Input';
import { ErrorBanner, errorMessage } from '../ui/Feedback';
import type { RegularTicketType } from '../../types/tickets';

/**
 * Шторка «Новая заявка» (DS-004, `tickets.md` п. 7.1).
 *
 * Почему шторка, а не страница: на телефоне закрытие возвращает к списку без
 * потери позиции скролла. Почему не `Modal` из UI-кита: у админской модалки
 * центрированная панель с отступом сверху, и на узком экране с открытой
 * клавиатурой кнопки уезжают под неё. Здесь — `fixed inset-x-0 bottom-0`,
 * прокручивается только сама шторка, футер с кнопкой липнет к низу.
 *
 * Что клиент НЕ может выбрать (и это не «disabled», а отсутствие поля):
 *  • `emergency` — SOS требует координат оператора на месте, ложный вызов
 *    поднимает всех ближайших исполнителей (`tickets.md` п. 2.1);
 *  • `priority` — внутренняя договорённость диспетчера;
 *  • `objectId` — всегда объект клиента из сессии, пользователь его не меняет.
 */

interface Room {
  id: string;
  name: string;
}

export interface TicketCreateSheetProps {
  open: boolean;
  objectId: string;
  onClose: () => void;
  /** Вызывается после успешного создания: список перезапрашивается, фокус — на карточку. */
  onCreated: (ticketId: string) => void;
}

/** Валидация описания: 10–2000 символов (то же ограничение, что подсказано в UI). */
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

export function TicketCreateSheet({ open, objectId, onClose, onCreated }: TicketCreateSheetProps) {
  const [description, setDescription] = useState('');
  const [type, setType] = useState<RegularTicketType>('unscheduled');
  const [floorId, setFloorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['object', objectId, 'detail'],
    queryFn: () => getObjectDetail(objectId),
    enabled: open && Boolean(objectId),
    staleTime: 60_000,
  });

  const floors = detail.data?.floors ?? [];
  const rooms: Room[] = useMemo(() => {
    const floor = floors.find((item) => item.id === floorId);
    return floor ? floor.rooms.map((room) => ({ id: room.id, name: room.name })) : [];
  }, [floors, floorId]);

  const create = useMutation({
    mutationFn: () =>
      createTicket({
        type,
        objectId,
        description: description.trim(),
        // `roomId` отправляем только при выбранном помещении: пустая строка —
        // это «фильтр задан» для DTO, и заявка привязалась бы к несуществующей комнате.
        ...(roomId ? { roomId } : {}),
      }),
    onSuccess: (ticket) => {
      setCreatedId(ticket.id);
      // Инвалидация всех лент заявок объекта: новая заявка должна появиться
      // первой и в списке, и в KPI на главной (`overview.md` п. 6.5).
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      reset();
      // Шторку закрывает не сам компонент, а экран: он же переключает фильтр на
      // «Все» и убирает `?new=1` из URL одним изменением адреса (иначе браузер
      // записал бы в историю два шага и «назад» вернул бы пустую шторку).
      onCreated(ticket.id);
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  function reset() {
    setDescription('');
    setType('unscheduled');
    setFloorId('');
    setRoomId('');
    setFieldError(null);
    setError(null);
    setCreatedId(null);
  }

  // Открытие шторки: фокус в поле описания — на телефоне клавиатура появляется
  // сразу, а скринридер объявляет начало формы.
  useEffect(() => {
    if (open) {
      setError(null);
      setFieldError(null);
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  // Esc закрывает шторку, но не во время запроса — иначе пользователь закроет
  // форму, не увидев ошибку отправки.
  const busy = create.isPending;
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        reset();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  function handleClose() {
    if (busy) return;
    // Шторка не закрывается молча, если текст уже набран: на телефоне случайный
    // тап по оверлею стирал бы набранное (tickets.md п. 7.1).
    if (
      description.trim() !== '' &&
      !window.confirm('Отменить заявку? Введённый текст будет потерян.')
    ) {
      return;
    }
    reset();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    const text = description.trim();
    if (text.length < DESCRIPTION_MIN) {
      setFieldError(`Опишите проблему подробнее — минимум ${DESCRIPTION_MIN} символов`);
      return;
    }
    if (text.length > DESCRIPTION_MAX) {
      setFieldError(`Слишком длинное описание — максимум ${DESCRIPTION_MAX} символов`);
      return;
    }
    create.mutate();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center lg:items-center"
      role="presentation"
    >
      {/* Оверлей: закрывает шторку только при пустом описании (см. handleClose). */}
      <div
        className="absolute inset-0 bg-neutral-900/60"
        onClick={handleClose}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Новая заявка"
        data-testid="portal-ticket-create-sheet"
        /*
         * `max-h-[85dvh]`: на телефоне с открытой клавиатурой `100vh` уводит
         * футер с кнопкой под клавиатуру. Прокручивается только шторка.
         */
        className="relative flex max-h-[85dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-xl lg:max-w-lg lg:rounded-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 pt-3">
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 lg:hidden"
            aria-hidden="true"
          />
          <h2 className="mb-3 text-base font-medium text-neutral-900">Новая заявка</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-3 min-h-[44px]"
            onClick={handleClose}
            disabled={create.isPending}
            aria-label="Закрыть"
          >
            ✕
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <Field
            label="Что случилось?"
            required
            error={fieldError}
            hint={!fieldError ? 'Чем точнее опишете, тем быстрее приедет исполнитель' : undefined}
          >
            <Textarea
              ref={textareaRef}
              name="description"
              className="min-h-[96px] text-base"
              placeholder="Опишите проблему: где, что, когда заметили"
              value={description}
              invalid={Boolean(fieldError)}
              disabled={create.isPending}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="portal-ticket-description"
            />
          </Field>
          <div className="-mt-3 text-right text-xs text-neutral-400">
            {description.length}/{DESCRIPTION_MAX}
          </div>

          {floors.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Этаж" htmlFor="portal-ticket-floor">
                <Select
                  id="portal-ticket-floor"
                  className="text-base"
                  value={floorId}
                  disabled={create.isPending}
                  onChange={(event) => {
                    setFloorId(event.target.value);
                    setRoomId('');
                  }}
                >
                  <option value="">Не знаю</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.number} · {floor.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Помещение" htmlFor="portal-ticket-room">
                <Select
                  id="portal-ticket-room"
                  className="text-base"
                  value={roomId}
                  disabled={create.isPending || !floorId}
                  onChange={(event) => setRoomId(event.target.value)}
                  data-testid="portal-ticket-room"
                >
                  <option value="">Не важно</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-neutral-500">Вид заявки</legend>
            <div className="flex flex-col gap-2">
              <RadioOption
                name="ticket-type"
                value="unscheduled"
                checked={type === 'unscheduled'}
                label="Внеплановая"
                hint="Нужно сделать, но не по графику"
                onChange={() => setType('unscheduled')}
              />
              <RadioOption
                name="ticket-type"
                value="planned"
                checked={type === 'planned'}
                label="Плановая"
                hint="Заказать работу заранее"
                onChange={() => setType('planned')}
              />
            </div>
          </fieldset>

          {error && <ErrorBanner error={error} />}
        </div>

        <div className="portal-sheet-footer sticky bottom-0 mt-auto flex gap-3 border-t border-neutral-200 bg-white px-4 pt-3 lg:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] flex-1 lg:flex-none"
            onClick={handleClose}
            disabled={create.isPending}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="min-h-[44px] flex-1 lg:flex-none"
            loading={create.isPending}
            data-testid="portal-ticket-submit"
          >
            Отправить заявку
          </Button>
        </div>
      </form>

      {/* Результат для скринридера: after создания шторка закрывается, и без
          объявления пользователь не узнал бы, что заявка создана. */}
      {createdId && (
        <span className="sr-only" role="status" aria-live="polite">
          Заявка создана
        </span>
      )}
    </div>
  );
}

function RadioOption({
  name,
  value,
  checked,
  label,
  hint,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  hint: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 text-primary-500 focus:ring-primary-500"
      />
      <span className="flex flex-col">
        <span className="text-sm text-neutral-900">{label}</span>
        <span className="text-xs text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}
