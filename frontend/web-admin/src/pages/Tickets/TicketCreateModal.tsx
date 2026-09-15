import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createTicket } from '../../api/tickets';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import {
  REGULAR_TICKET_TYPES,
  TICKET_PRIORITY_LABELS,
  TICKET_TYPE_LABELS,
  type CreateTicketPayload,
  type RegularTicketType,
  type TicketEntity,
} from '../../types/tickets';
import { TICKET_PRIORITIES, type TicketPriority } from '@cleaning-ops/shared/types/tickets';
import { useAssigneeOptions, useObjectOptions, useObjectRooms } from './useTickets';

/**
 * Форма создания плановой/внеплановой заявки (М3.7).
 *
 * Источник полей — `CreateTicketDto` ticket-service: тип ограничен
 * `planned`/`unscheduled` (аварийная создаётся только через SOS-эндпоинт),
 * приоритет необязателен (по умолчанию `normal`), исполнитель при задании
 * сразу переводит заявку в `assigned`.
 */

interface FormState {
  type: RegularTicketType;
  priority: TicketPriority;
  objectId: string;
  roomId: string;
  assigneeId: string;
  description: string;
  lat: string;
  lng: string;
}

const INITIAL: FormState = {
  type: 'planned',
  priority: 'normal',
  objectId: '',
  roomId: '',
  assigneeId: '',
  description: '',
  lat: '',
  lng: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

/** Число необязательно, но если введено — должно быть в диапазоне DTO. */
function validateCoordinate(raw: string, min: number, max: number, label: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} — число`;
  if (value < min || value > max) return `${label} — от ${min} до ${max}`;
  return undefined;
}

export function TicketCreateModal({
  open,
  onClose,
  onCreated,
  /** Объект, выбранный в фильтре списка (сокращает путь к созданию). */
  defaultObjectId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: TicketEntity) => void;
  defaultObjectId?: string;
}) {
  const canAssign = useCanAssignTicket();
  const objects = useObjectOptions();
  const assignees = useAssigneeOptions();

  const [values, setValues] = useState<FormState>(() => ({ ...INITIAL, objectId: defaultObjectId ?? '' }));
  const [errors, setErrors] = useState<Errors>({});

  const rooms = useObjectRooms(values.objectId === '' ? null : values.objectId);

  const create = useMutation({
    mutationFn: (payload: CreateTicketPayload) => createTicket(payload),
    onSuccess: (ticket) => onCreated(ticket),
  });

  const objectList = objects.data?.items ?? [];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    create.reset();
  }

  function handleSubmit() {
    const next: Errors = {};
    if (values.objectId === '') next.objectId = 'Выберите объект';
    const description = values.description.trim();
    if (description === '') next.description = 'Опишите работы';
    else if (description.length > 2000) next.description = 'Не больше 2000 символов';

    const latError = validateCoordinate(values.lat, -90, 90, 'Широта');
    if (latError !== undefined) next.lat = latError;
    const lngError = validateCoordinate(values.lng, -180, 180, 'Долгота');
    if (lngError !== undefined) next.lng = lngError;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    create.mutate({
      type: values.type,
      priority: values.priority,
      objectId: values.objectId,
      ...(values.roomId === '' ? {} : { roomId: values.roomId }),
      ...(canAssign && values.assigneeId !== '' ? { assigneeId: values.assigneeId } : {}),
      description,
      ...(values.lat.trim() === '' ? {} : { lat: Number(values.lat) }),
      ...(values.lng.trim() === '' ? {} : { lng: Number(values.lng) }),
    });
  }

  function handleClose() {
    setValues({ ...INITIAL, objectId: defaultObjectId ?? '' });
    setErrors({});
    create.reset();
    onClose();
  }

  // Ошибки DTO показываем у полей, общий баннер — для сети/403.
  const message = useMemo(() => create.error, [create.error]);

  return (
    <Modal
      open={open}
      title="Новая заявка"
      size="lg"
      busy={create.isPending}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={create.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="ticket-create-submit"
            loading={create.isPending}
            onClick={handleSubmit}
          >
            Создать заявку
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {message ? <ErrorBanner error={message} /> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Тип заявки" htmlFor="ticket-type" required>
            <Select
              id="ticket-type"
              data-testid="ticket-type"
              value={values.type}
              onChange={(event) => update('type', event.target.value as RegularTicketType)}
            >
              {REGULAR_TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TICKET_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Приоритет" htmlFor="ticket-priority" required>
            <Select
              id="ticket-priority"
              data-testid="ticket-priority"
              value={values.priority}
              onChange={(event) => update('priority', event.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Объект" htmlFor="ticket-object" required error={errors.objectId}>
            <Select
              id="ticket-object"
              data-testid="ticket-object"
              value={values.objectId}
              invalid={Boolean(errors.objectId)}
              disabled={objects.isLoading}
              onChange={(event) => {
                // Помещение принадлежит объекту: при смене объекта старый roomId невалиден.
                setValues((current) => ({
                  ...current,
                  objectId: event.target.value,
                  roomId: '',
                }));
                setErrors((current) => ({ ...current, objectId: undefined }));
                create.reset();
              }}
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
            label="Помещение"
            htmlFor="ticket-room"
            hint="Необязательно: заявка может быть на объект целиком"
          >
            <Select
              id="ticket-room"
              data-testid="ticket-room"
              value={values.roomId}
              disabled={values.objectId === '' || rooms.isLoading}
              onChange={(event) => update('roomId', event.target.value)}
            >
              <option value="">
                {values.objectId === ''
                  ? 'Сначала выберите объект'
                  : rooms.isLoading
                    ? 'Загрузка…'
                    : 'Без помещения'}
              </option>
              {(rooms.data ?? []).map(({ room, floor }) => (
                <option key={room.id} value={room.id}>
                  {floor.name} · {room.name}
                </option>
              ))}
            </Select>
          </Field>

          {canAssign && (
            <Field
              label="Исполнитель"
              htmlFor="ticket-assignee"
              hint="Если указать сразу — заявка создастся в статусе «Назначена»"
            >
              <Select
                id="ticket-assignee"
                data-testid="ticket-assignee"
                value={values.assigneeId}
                disabled={assignees.isLoading}
                onChange={(event) => update('assigneeId', event.target.value)}
              >
                <option value="">Не назначать сейчас</option>
                {(assignees.data?.supervisors.length ?? 0) > 0 && (
                  <optgroup label="Бригадиры">
                    {assignees.data?.supervisors.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(assignees.data?.operators.length ?? 0) > 0 && (
                  <optgroup label="Операторы">
                    {assignees.data?.operators.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          )}

          <div className="flex items-end gap-3">
            <Field label="Широта" htmlFor="ticket-lat" error={errors.lat} hint="Необязательно">
              <Input
                id="ticket-lat"
                className="font-mono"
                inputMode="decimal"
                placeholder="55.7558"
                value={values.lat}
                invalid={Boolean(errors.lat)}
                onChange={(event) => update('lat', event.target.value)}
              />
            </Field>
            <Field label="Долгота" htmlFor="ticket-lng" error={errors.lng} hint="Необязательно">
              <Input
                id="ticket-lng"
                className="font-mono"
                inputMode="decimal"
                placeholder="37.6173"
                value={values.lng}
                invalid={Boolean(errors.lng)}
                onChange={(event) => update('lng', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <Field
          label="Описание работ"
          htmlFor="ticket-description"
          required
          error={errors.description}
          hint="До 2000 символов: что нужно сделать и в каком объёме"
        >
          <Textarea
            id="ticket-description"
            data-testid="ticket-description"
            value={values.description}
            maxLength={2000}
            invalid={Boolean(errors.description)}
            onChange={(event) => update('description', event.target.value)}
          />
        </Field>

        {values.type === 'unscheduled' && (
          <p className="rounded-lg bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
            Внеплановая заявка попадёт в общий список с обычным приоритетом: SOS для аварий
            оформляется отдельной кнопкой — там приоритет всегда «Критичный».
          </p>
        )}
      </div>
    </Modal>
  );
}
