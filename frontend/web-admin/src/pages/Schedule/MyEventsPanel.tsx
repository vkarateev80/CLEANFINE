import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  SoftWarning,
  Table,
  TableMessageRow,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components/ui';
import { ROUTES } from '../../router/routes';
import { useCanCheckIn } from '../../hooks/usePermissions';
import type { SessionUser } from '../../types';
import type { ObjectEntity } from '../../types/core';
import type { ScheduleEventEntity } from '../../types/schedule';
import { CheckInModal } from './CheckInModal';
import { EventStatusBadge, shortId, utcTimeOf } from './scheduleHelpers';

/**
 * Вкладка «Мои смены»: смены текущего пользователя за период.
 *
 * Период и выбранная строка живут в query-строке (`myFrom`, `myTo`, `myEvent`),
 * чтобы ссылку на конкретный период можно было передать коллеге: сервис отдаёт
 * `GET /api/schedule/my` именно по пользователю из токена, поэтому «мои смены»
 * у каждого свои, а параметры отбора — общие для всех.
 *
 * Отметка прихода/ухода ставится ТОЛЬКО за себя (см. `CheckInModal`): `scheduleId`
 * берётся из выбранной строки, а кто отмечается — решает бэкенд по токену.
 */

/**
 * Можно ли отметить приход по этой смене: нужна смена без отметки и права
 * OPERATOR+. `MISSED` тоже допускаем: сервис ставит отметку, если `checkInAt` пуст
 * (`checkIn` смотрит на отметку, а не на статус), а оператор, опоздавший к началу,
 * иначе не смог бы выйти на смену. Жёсткое `CHECKED_OUT` сервис отвергает — его и
 * блокируем на клиенте.
 */
export function canCheckInEvent(event: ScheduleEventEntity): boolean {
  return event.checkInAt === null && event.status !== 'CHECKED_OUT';
}

/** Можно ли закрыть смену: только открытая (иначе сервис ответит 400/409). */
export function canCheckOutEvent(event: ScheduleEventEntity): boolean {
  return event.status === 'CHECKED_IN';
}

export function MyEventsPanel({
  from,
  to,
  selectedId,
  objects,
  users,
  currentUserId,
  events,
  isLoading,
  error,
  isFetching,
  isRefetchError,
  onRetry,
  onParamChange,
  notice,
  onNotice,
  onNoticeDismiss,
}: {
  from: string;
  to: string;
  /** id выбранной смены (`myEvent` в query-строке) — к ней привязаны кнопки отметки. */
  selectedId: string;
  objects: ObjectEntity[];
  users: SessionUser[];
  currentUserId: string | null;
  events: ScheduleEventEntity[] | undefined;
  isLoading: boolean;
  error: unknown;
  isFetching: boolean;
  isRefetchError: boolean;
  onRetry: () => void;
  onParamChange: (changes: Record<string, string | null>) => void;
  notice: string | null;
  onNotice: (message: string | null) => void;
  onNoticeDismiss: () => void;
}) {
  const canCheckIn = useCanCheckIn();
  const [checkInFor, setCheckInFor] = useState<ScheduleEventEntity | null>(null);

  const items = events ?? [];
  const objectNames = new Map(objects.map((object) => [object.id, object.name]));
  const userNames = new Map(users.map((user) => [user.id, user.fullName]));

  // Выбранная строка: id хранится в query-строке, поэтому кнопки остаются
  // привязанными к той же смене и после перезагрузки страницы.
  const selectedEvent = items.find((event) => event.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Field label="С" htmlFor="my-from">
          <Input
            id="my-from"
            data-testid="my-from"
            type="date"
            className="w-44"
            value={from}
            onChange={(event) => onParamChange({ myFrom: event.target.value || null })}
          />
        </Field>
        <Field label="По" htmlFor="my-to" hint="Включительно">
          <Input
            id="my-to"
            data-testid="my-to"
            type="date"
            className="w-44"
            value={to}
            onChange={(event) => onParamChange({ myTo: event.target.value || null })}
          />
        </Field>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {canCheckIn && (
            <>
              <Button
                variant="primary"
                data-testid="checkin-button"
                disabled={!selectedEvent || !canCheckInEvent(selectedEvent)}
                onClick={() => selectedEvent && setCheckInFor(selectedEvent)}
              >
                Отметить приход
              </Button>
              <Button
                variant="secondary"
                data-testid="checkout-button"
                disabled={!selectedEvent || !canCheckOutEvent(selectedEvent)}
                onClick={() => selectedEvent && setCheckInFor(selectedEvent)}
              >
                Отметить уход
              </Button>
            </>
          )}
        </div>
      </Card>

      <p className="text-xs text-neutral-500">
        Отметка ставится только за себя{currentUserId ? ` (вы: ${userNames.get(currentUserId) ?? currentUserId})` : ''}:
        сервис берёт пользователя из токена. Выберите строку смены, затем нажмите «Отметить приход»
        или «Отметить уход».
      </p>

      {notice && (
        <div
          role="status"
          data-testid="schedule-notice"
          className="flex items-start justify-between gap-3 rounded-lg border border-success-500 bg-white px-4 py-3 text-sm text-success-600"
        >
          <span>{notice}</span>
          <Button variant="ghost" size="sm" aria-label="Скрыть сообщение" onClick={onNoticeDismiss}>
            ✕
          </Button>
        </div>
      )}

      {error ? (
        <ErrorBanner error={error} onRetry={onRetry} />
      ) : (
        <>
          {isRefetchError && <SoftWarning>Смены могут быть неактуальны — обновите страницу.</SoftWarning>}

          {isLoading ? (
            <LoadingBlock label="Читаем ваши смены…" />
          ) : items.length === 0 ? (
            <EmptyState
              title="Ваших смен за период нет"
              hint="Смены появляются после генерации по графикам, где вы указаны исполнителем. Измените период или проверьте вкладку «Смены дня»."
            />
          ) : (
            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-neutral-500">
                <span>Смен за период: {items.length}</span>
                <span>Время указано в UTC</span>
              </div>
              <Table>
                <THead>
                  <Th className="w-[110px]">Дата</Th>
                  <Th className="w-[110px]">Начало</Th>
                  <Th className="w-[190px]">Отметки</Th>
                  <Th className="min-w-[200px]">График</Th>
                  <Th className="min-w-[180px]">Объект</Th>
                  <Th className="w-[150px]">Статус</Th>
                  <Th className="w-[140px]">Заявка</Th>
                  <Th className="w-[160px]" align="right">
                    Отметить
                  </Th>
                </THead>
                <TBody>
                  {items.map((event) => (
                    <Tr
                      key={event.id}
                      testId={`my-event-row-${event.id}`}
                      className={[
                        isFetching ? 'opacity-60' : '',
                        event.id === selectedId ? 'bg-primary-50' : '',
                      ].join(' ')}
                    >
                      <Td mono>{event.date}</Td>
                      <Td mono>{utcTimeOf(event.plannedStart)}</Td>
                      <Td mono>
                        {event.checkInAt ? (
                          <span className="block">приход {utcTimeOf(event.checkInAt)}</span>
                        ) : (
                          <span className="block text-neutral-400">прихода нет</span>
                        )}
                        {event.checkOutAt ? (
                          <span className="block">уход {utcTimeOf(event.checkOutAt)}</span>
                        ) : null}
                      </Td>
                      <Td>{event.scheduleName}</Td>
                      <Td>
                        {event.objectId ? (
                          objectNames.get(event.objectId) ?? shortId(event.objectId)
                        ) : (
                          <span className="text-neutral-400">без объекта</span>
                        )}
                      </Td>
                      <Td>
                        <span data-testid={`my-event-status-${event.id}`}>
                          <EventStatusBadge status={event.status} />
                        </span>
                      </Td>
                      <Td>
                        {event.ticketId ? (
                          <Link
                            className="font-mono text-xs text-primary-600 hover:underline"
                            to={ROUTES.ticket(event.ticketId)}
                          >
                            {shortId(event.ticketId)}
                          </Link>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {/*
                            Явное «Выбрать» рядом с панельными «Отметить приход/уход»:
                            кнопки в шапке работают с выбранной строкой, поэтому выбор
                            должен быть видимым и однозначным. Click по «Приход»/«Уход»
                            в строке делает то же самое сразу, без второго шага.
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`my-select-${event.id}`}
                            onClick={() => onParamChange({ myEvent: event.id })}
                          >
                            {event.id === selectedId ? 'Выбрана' : 'Выбрать'}
                          </Button>
                          {canCheckIn && canCheckInEvent(event) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`my-checkin-${event.id}`}
                              onClick={() => {
                                onParamChange({ myEvent: event.id });
                                setCheckInFor(event);
                              }}
                            >
                              Приход
                            </Button>
                          )}
                          {canCheckIn && canCheckOutEvent(event) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`my-checkout-${event.id}`}
                              onClick={() => {
                                onParamChange({ myEvent: event.id });
                                setCheckInFor(event);
                              }}
                            >
                              Уход
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}

                  {items.length === 0 && (
                    <TableMessageRow colSpan={8}>Смен за период нет</TableMessageRow>
                  )}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/*
        Модалка монтируется заново на каждую отметку (`key`): состояние
        геолокации и введённых координат не должно переезжать на другую смену.
      */}
      {checkInFor && (
        <CheckInModal
          key={checkInFor.id}
          open
          mode={canCheckOutEvent(checkInFor) ? 'check-out' : 'check-in'}
          event={checkInFor}
          onClose={() => setCheckInFor(null)}
          onDone={(message) => {
            setCheckInFor(null);
            onNotice(message);
          }}
        />
      )}
    </div>
  );
}
