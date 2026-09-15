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
  Select,
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
import { useIsScheduleAdmin } from '../../hooks/usePermissions';
import type { SessionUser } from '../../types';
import type { ObjectEntity } from '../../types/core';
import type {
  GenerationResult,
  MissedScanResult,
  ScheduleEventEntity,
  SchedulerState,
} from '../../types/schedule';
import { EventStatusBadge, formatUtcDateTime, shortId, utcTimeOf } from './scheduleHelpers';

/**
 * Вкладка «Смены дня»: что запланировано и что произошло в конкретный день.
 *
 * Фильтры (дата, объект, исполнитель) живут в query-строке с префиксом `day…`,
 * поэтому ссылку на конкретный день можно передать коллеге, а переключение
 * вкладок не сбрасывает отбор соседней.
 *
 * Время показывается в UTC — так же, как оно хранится в графике (`recurrence.time`
 * в `recurrence.ts` schedule-service): сервис не знает локальную зону объекта, и
 * «08:00» здесь означает именно 08:00 UTC, а не 08:00 по часам браузера.
 * Окончание смены в модели отсутствует — есть только фактический `checkOutAt`,
 * поэтому в колонке «Окончание» показываем прочерк или факт закрытия.
 *
 * Ручные триггеры (`/generate`, `/check-missed`) и состояние планировщика доступны
 * только ADMIN: это действия над периодическими проходами, а не рабочее действие
 * смены (у оператора и бригадира их нет в `@Roles` контроллера).
 */

/** Сводка генерации одной строкой: что сделал проход и на какую дату. */
export function generationSummary(result: GenerationResult): string {
  const parts = [
    `Дата: ${result.date}`,
    `подходящих графиков: ${result.schedulesMatched}`,
    `создано смен: ${result.shiftsCreated}`,
    `уже было: ${result.shiftsSkipped}`,
    `создано заявок: ${result.ticketsCreated}`,
    `заявок до-создано: ${result.ticketsBackfilled}`,
  ];
  if (result.ticketsFailed > 0) parts.push(`заявок не создано: ${result.ticketsFailed}`);
  if (result.ticketServiceUnavailable) parts.push('ticket-service был недоступен');
  if (result.errors.length > 0) parts.push(`ошибки: ${result.errors.join('; ')}`);
  return parts.join(' · ');
}

/** Сводка прогона неявок: сколько проверено, сколько стало неявками, сколько закрыто авто. */
export function missedSummary(result: MissedScanResult): string {
  return (
    `Проверено смен: ${result.missed.scanned} · ` +
    `неявок: ${result.missed.missed} · ` +
    `закрыто автоматически: ${result.autoCheckout.closed}`
  );
}

export function DayEventsPanel({
  date,
  objectId,
  userId,
  objects,
  users,
  canFilterByUser,
  events,
  isLoading,
  error,
  isFetching,
  isRefetchError,
  onRetry,
  onParamChange,
  generate,
  checkMissed,
  generateError,
  checkMissedError,
  generation,
  missed,
  schedulerState,
  schedulerOpen,
  schedulerPending,
  schedulerError,
  onToggleScheduler,
}: {
  date: string;
  objectId: string;
  userId: string;
  objects: ObjectEntity[];
  users: SessionUser[];
  /** Фильтр по исполнителю требует справочника `/api/users` (ADMIN/SUPERVISOR). */
  canFilterByUser: boolean;
  events: ScheduleEventEntity[] | undefined;
  isLoading: boolean;
  error: unknown;
  isFetching: boolean;
  isRefetchError: boolean;
  onRetry: () => void;
  onParamChange: (changes: Record<string, string | null>) => void;
  generate: { mutate: (date: string) => void; isPending: boolean };
  checkMissed: { mutate: (date: string) => void; isPending: boolean };
  generateError: unknown;
  checkMissedError: unknown;
  generation: GenerationResult | null;
  missed: MissedScanResult | null;
  schedulerState: SchedulerState | undefined;
  schedulerOpen: boolean;
  schedulerPending: boolean;
  schedulerError: unknown;
  onToggleScheduler: () => void;
}) {
  const isAdmin = useIsScheduleAdmin();
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const items = events ?? [];
  const objectNames = new Map(objects.map((object) => [object.id, object.name]));
  const userNames = new Map(users.map((user) => [user.id, user.fullName]));
  const filtersActive = objectId !== '' || userId !== '';

  /*
   * Сводка берётся из последнего ответа мутации: сервер возвращает, сколько смен
   * создано, сколько пропущено идемпотентно и сколько заявок не удалось создать.
   * Показывать её вместо пересказа на клиенте важно: клиент не может знать про
   * до-созданные заявки после сбоя ticket-service.
   */
  const notice = generation
    ? generationSummary(generation)
    : missed
      ? missedSummary(missed)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Field label="Дата" htmlFor="events-date" required>
          <Input
            id="events-date"
            data-testid="events-date"
            type="date"
            className="w-44"
            value={date}
            onChange={(event) => onParamChange({ dayDate: event.target.value || null })}
          />
        </Field>

        <Field label="Объект" htmlFor="events-object-filter">
          <Select
            id="events-object-filter"
            data-testid="events-object-filter"
            className="w-64"
            value={objectId}
            onChange={(event) => onParamChange({ dayObject: event.target.value || null })}
          >
            <option value="">Все объекты</option>
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </Field>

        {canFilterByUser && (
          <Field label="Исполнитель" htmlFor="events-user-filter">
            <Select
              id="events-user-filter"
              data-testid="events-user-filter"
              className="w-64"
              value={userId}
              onChange={(event) => onParamChange({ dayUser: event.target.value || null })}
            >
              <option value="">Все исполнители</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onParamChange({ dayObject: null, dayUser: null })}
          >
            Сбросить фильтры
          </Button>
        )}

        {isAdmin && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              data-testid="events-generate-button"
              loading={generate.isPending}
              onClick={() => {
                setNoticeDismissed(false);
                generate.mutate(date);
              }}
            >
              Сгенерировать смены на дату
            </Button>
            <Button
              variant="secondary"
              data-testid="events-check-missed-button"
              loading={checkMissed.isPending}
              onClick={() => {
                setNoticeDismissed(false);
                checkMissed.mutate(date);
              }}
            >
              Прогнать неявки
            </Button>
            <Button variant="ghost" onClick={onToggleScheduler}>
              Состояние планировщика
            </Button>
          </div>
        )}
      </Card>

      {/*
        `data-testid="schedule-notice"` — общий баннер результата действий на экране
        (сводка генерации/неявок, результат отметки смены): e2e проверяет по нему
        текст ответа сервера, а не состояние формы.
      */}
      {notice && !noticeDismissed && (
        <div
          role="status"
          data-testid="schedule-notice"
          className="flex items-start justify-between gap-3 rounded-lg border border-success-500 bg-white px-4 py-3 text-sm text-success-600"
        >
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Скрыть сообщение"
            onClick={() => setNoticeDismissed(true)}
          >
            ✕
          </Button>
        </div>
      )}

      {isAdmin && schedulerOpen && (
        // `testId`, а не `data-testid`: `<Card>` не разворачивает произвольные
        // атрибуты (в нём нет spread), и `data-testid` в JSX молча терялся бы —
        // селектор в e2e не нашёл бы блок при видимом содержимом.
        <Card testId="scheduler-state">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-neutral-800">Состояние планировщика</h3>
            <Button variant="ghost" size="sm" onClick={onToggleScheduler}>
              Закрыть
            </Button>
          </div>
          {schedulerPending ? (
            <div className="mt-3">
              <LoadingBlock label="Читаем состояние…" />
            </div>
          ) : schedulerError ? (
            <div className="mt-3">
              <ErrorBanner error={schedulerError} onRetry={onToggleScheduler} />
            </div>
          ) : (
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Последняя генерация</dt>
                <dd className="font-mono text-xs text-neutral-800">
                  {schedulerState?.lastGenerateAt
                    ? formatUtcDateTime(schedulerState.lastGenerateAt)
                    : 'ещё не запускалась'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Дата последней генерации</dt>
                <dd className="font-mono text-xs text-neutral-800">
                  {schedulerState?.lastGenerateDate ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Последняя проверка неявок</dt>
                <dd className="font-mono text-xs text-neutral-800">
                  {schedulerState?.lastScanAt
                    ? formatUtcDateTime(schedulerState.lastScanAt)
                    : 'ещё не запускалась'}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      )}

      {/*
        Ошибки ручных триггеров показываем без кнопки «Повторить»: повтор — это
        осознанное действие кнопкой на карточке фильтров, а не «ещё раз тот же
        запрос» (генерация и прогон неявок не идемпотентны по смыслу действия).
      */}
      {generateError ? <ErrorBanner error={generateError} /> : null}

      {checkMissedError ? <ErrorBanner error={checkMissedError} /> : null}

      {error ? (
        <ErrorBanner error={error} onRetry={onRetry} />
      ) : (
        <>
          {isRefetchError && (
            <SoftWarning>Смены могут быть неактуальны — обновите страницу.</SoftWarning>
          )}

          {isLoading ? (
            <LoadingBlock label="Читаем смены дня…" />
          ) : items.length === 0 ? (
            <EmptyState
              title="Смен на этот день нет"
              hint={
                isAdmin
                  ? 'Нажмите «Сгенерировать смены на дату» — проход создаст смены по активным графикам и плановые заявки'
                  : filtersActive
                    ? 'За выбранный объект и исполнителя смен нет — измените фильтры'
                    : 'Смены создаются генерацией по активным графикам'
              }
            />
          ) : (
            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-neutral-500">
                <span>Смен за день: {items.length}</span>
                <span>Время указано в UTC</span>
              </div>
              <Table>
                <THead>
                  <Th className="w-[110px]">Начало</Th>
                  <Th className="w-[190px]">Окончание</Th>
                  <Th className="min-w-[200px]">График</Th>
                  <Th className="min-w-[180px]">Объект</Th>
                  <Th className="min-w-[170px]">Исполнитель</Th>
                  <Th className="w-[150px]">Статус</Th>
                  <Th className="w-[140px]">Заявка</Th>
                </THead>
                <TBody>
                  {items.map((event) => (
                    <Tr
                      key={event.id}
                      testId={`event-row-${event.id}`}
                      className={isFetching ? 'opacity-60' : ''}
                    >
                      <Td mono>{utcTimeOf(event.plannedStart)}</Td>
                      <Td mono>
                        {event.checkOutAt ? (
                          utcTimeOf(event.checkOutAt)
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
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
                        {event.userId ? (
                          userNames.get(event.userId) ?? <span className="font-mono text-xs">{shortId(event.userId)}</span>
                        ) : (
                          <span className="text-neutral-400">не назначен</span>
                        )}
                      </Td>
                      <Td>
                        <span data-testid={`event-status-${event.id}`}>
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
                    </Tr>
                  ))}

                  {items.length === 0 && (
                    <TableMessageRow colSpan={7}>Смен на этот день нет</TableMessageRow>
                  )}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
