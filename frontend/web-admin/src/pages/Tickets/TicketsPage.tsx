import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={total > 0 ? `Заявки · ${total}` : 'Заявки'}
        subtitle="Плановые, внеплановые и аварийные работы по объектам"
        actions={
          <>
            <Button
              variant="danger"
              data-testid="ticket-sos-button"
              onClick={() => setSosOpen(true)}
            >
              🚨 SOS
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                data-testid="ticket-create-button"
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
        <div className="flex flex-wrap items-center gap-3">
          <FilterSlot width="w-48">
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

          <FilterSlot width="w-48">
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

          <FilterSlot width="w-48">
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

          <FilterSlot width="w-64">
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
            <FilterSlot width="w-64">
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
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    Создать заявку
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <Card padded={false}>
            <Table>
              <THead>
                <Th className="w-[150px]">Тип / приоритет</Th>
                <Th className="w-[140px]">Статус</Th>
                <Th className="min-w-[240px]">Описание</Th>
                <Th className="w-[200px]">Объект</Th>
                <Th className="w-[180px]">Исполнитель</Th>
                <Th className="w-[120px]">Связи</Th>
                <Th className="w-[150px]">Создана</Th>
              </THead>
              <TBody>
                {showSkeleton
                  ? Array.from({ length: 5 }).map((_, row) => (
                      <Tr key={row}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <Td key={cell}>
                            <span className="block h-4 w-full animate-pulse rounded-md bg-neutral-200" />
                          </Td>
                        ))}
                      </Tr>
                    ))
                  : items.map((ticket) => {
                      const assignee = userName(assignees.data?.items, ticket.assigneeId);
                      return (
                        <Tr
                          key={ticket.id}
                          className={query.isFetching && !showSkeleton ? 'opacity-60' : ''}
                          onClick={() => navigate(ROUTES.ticket(ticket.id))}
                        >
                          <Td>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-neutral-700">
                                {TICKET_TYPE_LABELS[ticket.type]}
                              </span>
                              <TicketPriorityBadge
                                priority={ticket.priority}
                                label={TICKET_PRIORITY_LABELS[ticket.priority]}
                              />
                            </div>
                          </Td>
                          <Td>
                            <TicketStatusBadge status={ticket.status} />
                          </Td>
                          <Td className="max-w-[360px]">
                            <span
                              className="block truncate text-neutral-800"
                              title={ticket.description}
                            >
                              {ticket.description}
                            </span>
                            <span className="font-mono text-xs text-neutral-400">
                              {shortId(ticket.id)}
                            </span>
                          </Td>
                          <Td>
                            {/* Ссылка на объект: клик по строке ведёт в заявку, поэтому
                                переход к объекту — отдельная ссылка. */}
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
                          </Td>
                          <Td>
                            {assignee ? (
                              <span className="text-neutral-800">{assignee}</span>
                            ) : ticket.assigneeId ? (
                              <span className="font-mono text-xs text-neutral-400">
                                {shortId(ticket.assigneeId)}
                              </span>
                            ) : (
                              <span className="text-neutral-400">Не назначен</span>
                            )}
                          </Td>
                          <Td>
                            <span className="font-mono text-xs text-neutral-500">
                              {ticket._count.comments} 💬 · {ticket._count.operations} ✅ ·{' '}
                              {ticket._count.assignments} 👤
                            </span>
                          </Td>
                          <Td mono>{formatDateTime(ticket.createdAt)}</Td>
                        </Tr>
                      );
                    })}

                {!showSkeleton && items.length === 0 && (
                  <TableMessageRow colSpan={7}>Заявок на этой странице нет</TableMessageRow>
                )}
              </TBody>
            </Table>

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
