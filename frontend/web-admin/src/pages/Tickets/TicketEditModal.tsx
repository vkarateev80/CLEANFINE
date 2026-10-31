import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from '@cleaning-ops/shared/types/tickets';
import { updateTicket } from '../../api/tickets';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  type TicketEntity,
  type UpdateTicketPayload,
} from '../../types/tickets';
import {
  buildTicketPatch,
  editErrorsOf,
  editValuesOf,
  withAssignee,
  withStatus,
  type TicketEditErrors,
  type TicketEditValues,
} from './ticketEdit';
import { shortId } from './ticketHelpers';
import { useAssigneeOptions, useObjectOptions, useObjectRooms } from './useTickets';

/**
 * Правка заявки администратором (01.11.2026): в любом статусе, включая выполненные
 * и закрытые. Монтируется на время открытия, поэтому форма всегда начинается со
 * свежих значений заявки.
 *
 * Справочники неполны (первая сотня объектов, только активные бригадиры и операторы),
 * а `select` без подходящей опции молча показал бы первую: у текущих значений заявки
 * вне справочника есть своя опция с коротким id.
 */
export function TicketEditModal({
  ticket,
  onClose,
}: {
  ticket: TicketEntity;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const objects = useObjectOptions();
  const assignees = useAssigneeOptions();

  const [values, setValues] = useState<TicketEditValues>(() => editValuesOf(ticket));
  const [errors, setErrors] = useState<TicketEditErrors>({});

  const rooms = useObjectRooms(values.objectId === '' ? null : values.objectId);

  const save = useMutation({
    mutationFn: (payload: UpdateTicketPayload) => updateTicket(ticket.id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
      onClose();
    },
  });

  function apply(next: TicketEditValues) {
    setValues(next);
    setErrors({});
    save.reset();
  }

  function handleSubmit() {
    const next = editErrorsOf(ticket, values);
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    const patch = buildTicketPatch(ticket, values);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    save.mutate(patch);
  }

  const objectKnown = (objects.data?.items ?? []).some((item) => item.id === values.objectId);
  const roomKnown = (rooms.data ?? []).some(({ room }) => room.id === values.roomId);
  const assigneeKnown = (assignees.data?.items ?? []).some((user) => user.id === values.assigneeId);

  return (
    <Modal
      open
      title="Редактирование заявки"
      size="lg"
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="ticket-edit-submit"
            loading={save.isPending}
            onClick={handleSubmit}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {save.error ? <ErrorBanner error={save.error} /> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Статус"
            htmlFor="ticket-edit-status"
            required
            hint="Можно выбрать любой статус: отметки времени пересчитаются сами"
          >
            <Select
              id="ticket-edit-status"
              data-testid="ticket-edit-status"
              value={values.status}
              onChange={(event) => apply(withStatus(values, event.target.value as TicketStatus))}
            >
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TICKET_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Исполнитель"
            htmlFor="ticket-edit-assignee"
            error={errors.assigneeId}
            hint="Новому исполнителю в незавершённой заявке придёт уведомление"
          >
            <Select
              id="ticket-edit-assignee"
              data-testid="ticket-edit-assignee"
              value={values.assigneeId}
              invalid={Boolean(errors.assigneeId)}
              disabled={assignees.isLoading}
              onChange={(event) => apply(withAssignee(values, event.target.value))}
            >
              <option value="">Не назначен</option>
              {values.assigneeId !== '' && !assigneeKnown && (
                <option value={values.assigneeId}>{shortId(values.assigneeId)}</option>
              )}
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

          <Field label="Тип заявки" htmlFor="ticket-edit-type" required>
            <Select
              id="ticket-edit-type"
              data-testid="ticket-edit-type"
              value={values.type}
              onChange={(event) => apply({ ...values, type: event.target.value as TicketType })}
            >
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TICKET_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Приоритет" htmlFor="ticket-edit-priority" required>
            <Select
              id="ticket-edit-priority"
              data-testid="ticket-edit-priority"
              value={values.priority}
              onChange={(event) =>
                apply({ ...values, priority: event.target.value as TicketPriority })
              }
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Объект" htmlFor="ticket-edit-object" required error={errors.objectId}>
            <Select
              id="ticket-edit-object"
              data-testid="ticket-edit-object"
              value={values.objectId}
              invalid={Boolean(errors.objectId)}
              disabled={objects.isLoading}
              // Помещение принадлежит объекту: при смене объекта старое невалидно.
              onChange={(event) => apply({ ...values, objectId: event.target.value, roomId: '' })}
            >
              {!objectKnown && <option value={values.objectId}>{shortId(values.objectId)}</option>}
              {(objects.data?.items ?? []).map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Помещение" htmlFor="ticket-edit-room">
            <Select
              id="ticket-edit-room"
              data-testid="ticket-edit-room"
              value={values.roomId}
              disabled={rooms.isLoading}
              onChange={(event) => apply({ ...values, roomId: event.target.value })}
            >
              <option value="">Объект целиком</option>
              {values.roomId !== '' && !roomKnown && (
                <option value={values.roomId}>{shortId(values.roomId)}</option>
              )}
              {(rooms.data ?? []).map(({ room, floor }) => (
                <option key={room.id} value={room.id}>
                  {floor.name} · {room.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-3 md:col-span-2">
            <Field label="Широта" htmlFor="ticket-edit-lat" error={errors.lat} hint="Необязательно">
              <Input
                id="ticket-edit-lat"
                className="font-mono"
                inputMode="decimal"
                value={values.lat}
                invalid={Boolean(errors.lat)}
                onChange={(event) => apply({ ...values, lat: event.target.value })}
              />
            </Field>
            <Field
              label="Долгота"
              htmlFor="ticket-edit-lng"
              error={errors.lng}
              hint="Необязательно"
            >
              <Input
                id="ticket-edit-lng"
                className="font-mono"
                inputMode="decimal"
                value={values.lng}
                invalid={Boolean(errors.lng)}
                onChange={(event) => apply({ ...values, lng: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <Field
          label="Описание работ"
          htmlFor="ticket-edit-description"
          required
          error={errors.description}
        >
          <Textarea
            id="ticket-edit-description"
            data-testid="ticket-edit-description"
            value={values.description}
            maxLength={2000}
            invalid={Boolean(errors.description)}
            onChange={(event) => apply({ ...values, description: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
