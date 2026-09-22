import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
  ResponsiveTable,
  Select,
  SoftWarning,
  type ResponsiveColumn,
} from '../../components/ui';
import { useCanAssignTicket, useCanCreateTicket } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from '@cleaning-ops/shared/types/tickets';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  type TicketListItem,
} from '../../types/tickets';
import { EmergencyTicketModal } from './EmergencyTicketModal';
import { TicketCreateModal } from './TicketCreateModal';
import {
  FilterSlot,
  TicketPriorityBadge,
  TicketStatusBadge,
  apiStatus,
  formatDateTime,
  shortId,
} from './ticketHelpers';
import { useAssigneeOptions, useObjectOptions, useTickets, userName } from './useTickets';

/**
 * Экран «Заявки» (М3.7): список с фильтрами и пагинацией, создание
 * плановой/внеплановой заявки и SOS.
 *
 * Фильтры и страница живут в query-строке (`useSearchParams`) — ссылку на
 * конкретный отбор можно передать коллеге, а возврат назад восстанавливает
 * состояние (тот же приём, что в списке объектов).
 *
 * Пагинация — `skip`/`take`: так устроен `ListTicketsQueryDto` (в core-сервисах
 * он же), и этому контракту соответствует общий компонент `Pagination`.
 */

const TAKE = 25;

/**
 * Пустое состояние в карточном режиме: в таблице текст и отступы задаёт
 * `TableMessageRow`, поэтому все классы — `max-md:` и на планшете с desktop
 * разметка не меняется.
 */
const PHONE_EMPTY =
  'max-md:block max-md:rounded-xl max-md:border max-md:border-dashed max-md:border-neutral-300 max-md:bg-white max-md:px-4 max-md:py-8 max-md:text-center max-md:text-sm max-md:text-neutral-400';

export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const canCreate = useCanCreateTicket();
  const canAssign = useCanAssignTicket();

  const skip = Number(params.get('skip') ?? '0') || 0;
  const take = Number(params.get('take') ?? String(TAKE)) || TAKE;
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const priority = params.get('priority') ?? '';
  const objectId = params.get('objectId') ?? '';
  const assigneeId = params.get('assigneeId') ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const query = useTickets({
    skip,
    take,
    ...(status === '' ? {} : { status: status as TicketListItem['status'] }),
    ...(type === '' ? {} : { type: type as TicketListItem['type'] }),
    ...(priority === '' ? {} : { priority: priority as TicketListItem['priority'] }),
    ...(objectId === '' ? {} : { objectId }),
    ...(assigneeId === '' ? {} : { assigneeId }),
  });

  const objects = useObjectOptions();
  // Справочник сотрудников доступен только ADMIN/SUPERVISOR: у остальных ролей
  // запрос выключен (`enabled`), и колонка «Исполнитель» покажет короткий id.
  const assignees = useAssigneeOptions();

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const forbidden = apiStatus(query.error) === 403;

  const objectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const object of objects.data?.items ?? []) map.set(object.id, object.name);
    return map;
  }, [objects.data]);

  const filtersActive =
    status !== '' || type !== '' || priority !== '' || objectId !== '' || assigneeId !== '';

  function updateParams(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  function resetFilters() {
    updateParams({ status: null, type: null, priority: null, objectId: null, assigneeId: null, skip: null });
  }

  const showSkeleton = query.isLoading;

  /**
   * Колонки списка описаны один раз (ADR-002): `cell` — ячейка таблицы
   * (на `md+` разметка прежняя, ширины перенесены из `<Th>`), `card` — роль в
   * карточке телефона. У заявки нет «названия», поэтому `title` — описание
   * (суть работы), `subtitle` — тип и приоритет, `badge` — статус, остальное —
   * поля «подпись — значение».
   */
  const columns: ResponsiveColumn<TicketListItem>[] = [
    {
      key: 'type',
      header: 'Тип / приоритет',
      thClassName: 'w-[150px]',
      cell: (ticket) => (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-700">{TICKET_TYPE_LABELS[ticket.type]}</span>
          <TicketPriorityBadge
            priority={ticket.priority}
            label={TICKET_PRIORITY_LABELS[ticket.priority]}
          />
        </div>
      ),
      card: 'subtitle',
    },
    {
      key: 'status',
      header: 'Статус',
      thClassName: 'w-[140px]',
      cell: (ticket) => <TicketStatusBadge status={ticket.status} />,
      card: 'badge',
    },
    {
      key: 'description',
      header: 'Описание',
      thClassName: 'min-w-[240px]',
      cellClassName: 'max-w-[360px]',
      cell: (ticket) => (
        <>
          {/* `truncate` — плотность таблицы; в карточке описание переносится
              строками, иначе на телефоне от него оставалась бы одна строка. */}
          <span
            className="block truncate text-neutral-800 max-md:overflow-visible max-md:whitespace-normal max-md:break-words"
            title={ticket.description}
          >
            {ticket.description}
          </span>
          <span className="font-mono text-xs text-neutral-400">{shortId(ticket.id)}</span>
        </>
      ),
      card: 'title',
    },
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'w-[200px]',
      cell: (ticket) => (
        <>
          {/* Ссылка на объект: клик по строке ведёт в заявку, поэтому переход к
              объекту — отдельная ссылка (в карточке правило то же). */}
          <Link
            to={ROUTES.object(ticket.objectId)}
            className="text-primary-600 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {objectNames.get(ticket.objectId) ?? shortId(ticket.objectId)}
          </Link>
          {ticket.roomId && (
            <div className="font-mono text-xs text-neutral-400">
              помещение {shortId(ticket.roomId)}
            </div>
          )}
        </>
      ),
      card: 'field',
      cardLabel: 'Объект',
    },
    {
      key: 'assignee',
      header: 'Исполнитель',
      thClassName: 'w-[180px]',
      cell: (ticket) => {
        const assignee = userName(assignees.data?.items, ticket.assigneeId);
        if (assignee) return <span className="text-neutral-800">{assignee}</span>;
        if (ticket.assigneeId) {
          return (
            <span className="font-mono text-xs text-neutral-400">{shortId(ticket.assigneeId)}</span>
          );
        }
        return <span className="text-neutral-400">Не назначен</span>;
      },
      card: 'field',
      cardLabel: 'Исполнитель',
    },
    {
      key: 'links',
      header: 'Связи',
      thClassName: 'w-[120px]',
      cell: (ticket) => (
        <span className="font-mono text-xs text-neutral-500">
          {ticket._count.comments} 💬 · {ticket._count.operations} ✅ ·{' '}
          {ticket._count.assignments} 👤
        </span>
      ),
      card: 'field',
      cardLabel: 'Связи',
    },
    {
      key: 'created',
      header: 'Создана',
      thClassName: 'w-[150px]',
      mono: true,
      cell: (ticket) => formatDateTime(ticket.createdAt),
      card: 'field',
      cardLabel: 'Создана',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={total > 0 ? `Заявки · ${total}` : 'Заявки'}
        subtitle="Плановые, внеплановые и аварийные работы по объектам"
        actions={
          <>
            {/* SOS — главное действие телефона: крупный тач-таргет на всю ширину
                строки действий (на `md+` кнопки остаются в прежнем ряду). */}
            <Button
              variant="danger"
              data-testid="ticket-sos-button"
              className="max-md:w-full max-lg:min-h-[48px] max-md:text-base"
              onClick={() => setSosOpen(true)}
            >
              🚨 SOS
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                data-testid="ticket-create-button"
                className="max-md:w-full max-lg:min-h-[44px]"
                onClick={() => {
                  setCreatedId(null);
                  setCreateOpen(true);
                }}
              >
                Создать заявку
              </Button>
            )}
          </>
        }
      />

      {createdId && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success-500 bg-white px-4 py-3 text-sm text-success-600"
        >
          <span>Заявка создана.</span>
          <Link className="text-primary-600 hover:underline" to={ROUTES.ticket(createdId)}>
            Открыть заявку →
          </Link>
        </div>
      )}

      {query.isError && forbidden && (
        <ErrorBanner
          error={new Error('Недостаточно прав для просмотра заявок')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isError && !forbidden && (
        <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />
      )}

      <Card className="flex flex-col gap-4">
        {/* Пять фильтров фиксированной ширины (`w-48`/`w-64`) на телефоне встают
            в одну колонку на всю ширину; на `md+` — прежний ряд с переносом. */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterSlot width="w-48 max-md:w-full">
            <Select
              data-testid="tickets-status-filter"
              aria-label="Фильтр по статусу"
              value={status}
              onChange={(event) => updateParams({ status: event.target.value, skip: null })}
            >
              <option value="">Все статусы</option>
              {TICKET_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {TICKET_STATUS_LABELS[item]}
                </option>
              ))}
            </Select>
          </FilterSlot>

          <FilterSlot width="w-48 max-md:w-full">
            <Select
              data-testid="tickets-type-filter"
              aria-label="Фильтр по типу"
              value={type}
              onChange={(event) => updateParams({ type: event.target.value, skip: null })}
            >
              <option value="">Все типы</option>
              {TICKET_TYPES.map((item) => (
                <option key={item} value={item}>
                  {TICKET_TYPE_LABELS[item]}
                </option>
              ))}
            </Select>
          </FilterSlot>

          <FilterSlot width="w-48 max-md:w-full">
            <Select
              aria-label="Фильтр по приоритету"
              value={priority}
              onChange={(event) => updateParams({ priority: event.target.value, skip: null })}
            >
              <option value="">Все приоритеты</option>
              {TICKET_PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {TICKET_PRIORITY_LABELS[item]}
                </option>
              ))}
            </Select>
          </FilterSlot>

          <FilterSlot width="w-64 max-md:w-full">
            <Select
              data-testid="tickets-object-filter"
              aria-label="Фильтр по объекту"
              value={objectId}
              disabled={objects.isLoading}
              onChange={(event) => updateParams({ objectId: event.target.value, skip: null })}
            >
              <option value="">Все объекты</option>
              {(objects.data?.items ?? []).map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </Select>
          </FilterSlot>

          {canAssign && (
            <FilterSlot width="w-64 max-md:w-full">
              <Select
                aria-label="Фильтр по исполнителю"
                value={assigneeId}
                disabled={assignees.isLoading}
                onChange={(event) => updateParams({ assigneeId: event.target.value, skip: null })}
              >
                <option value="">Все исполнители</option>
                {(assignees.data?.items ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </Select>
            </FilterSlot>
          )}

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          )}
        </div>

        {query.isFetching && !query.isLoading && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-500" />
          </div>
        )}
      </Card>

      {!query.isError && query.isRefetchError && (
        <SoftWarning>Список может быть неактуален — обновите страницу.</SoftWarning>
      )}

      {!query.isError &&
        (total === 0 && !showSkeleton ? (
          filtersActive ? (
            <EmptyState
              title="Ничего не найдено"
              hint="Измените условия фильтра"
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Заявок пока нет"
              hint="Создайте плановую заявку или отправьте SOS при аварии"
              action={
                canCreate ? (
                  <Button
                    variant="primary"
                    className="max-lg:min-h-[44px]"
                    onClick={() => setCreateOpen(true)}
                  >
                    Создать заявку
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <Card padded={false}>
            {/* Таблица из 7 колонок была шире вьюпорта на 200 px уже при 360 px:
                на телефоне — карточки, на `md+` — прежняя таблица. */}
            <ResponsiveTable
              items={items}
              getKey={(ticket) => ticket.id}
              rowClassName={() => (query.isFetching && !showSkeleton ? 'opacity-60' : '')}
              onRowClick={(ticket) => navigate(ROUTES.ticket(ticket.id))}
              loading={showSkeleton}
              empty={<span className={PHONE_EMPTY}>Заявок на этой странице нет</span>}
              columns={columns}
            />

            <Pagination
              total={total}
              skip={skip}
              take={take}
              disabled={query.isFetching}
              onChange={({ skip: nextSkip, take: nextTake }) =>
                updateParams({ skip: String(nextSkip), take: String(nextTake) })
              }
            />
          </Card>
        ))}

      <TicketCreateModal
        open={createOpen}
        defaultObjectId={objectId === '' ? undefined : objectId}
        onClose={() => setCreateOpen(false)}
        onCreated={(ticket) => {
          setCreateOpen(false);
          setCreatedId(ticket.id);
          void query.refetch();
        }}
      />

      <EmergencyTicketModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        onCreated={(ticket) => {
          setSosOpen(false);
          setCreatedId(ticket.id);
          void query.refetch();
        }}
      />
    </div>
  );
}
