import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import { listTickets } from '../../api/tickets';
import { Card, ErrorBanner } from '../../components/ui';
import { ROUTES } from '../../router/routes';
import { notificationTypeIcon, type NotificationEntity } from '../../types/notifications';
import { TICKET_PRIORITY_LABELS, type TicketListItem } from '../../types/tickets';
import { notificationTarget } from '../Notifications/NotificationBell';
import { useRecentNotifications } from '../Notifications/useNotifications';
import {
  TicketPriorityBadge,
  TicketStatusBadge,
  formatDateTime,
  shortId,
} from '../Tickets/ticketHelpers';
import { useAssigneeOptions, useObjectOptions, userName } from '../Tickets/useTickets';

/**
 * Живой блок доски действий (09.10.2026): «что происходит сейчас».
 *
 * KPI за 30 дней не отвечают на вопрос админа «оператор взял заявку в работу?».
 * Здесь — открытые заявки по статусам (новые, назначенные, в работе,
 * просроченные) с исполнителем и прогрессом операций, плюс последние
 * уведомления (SOS, смена статуса, сообщения). Опрос раз в 30 с: заявки
 * меняет оператор с телефона, перезагружать страницу админ не должен.
 */

export const LIVE_POLL_MS = 30_000;

/** Открытые статусы в порядке срочности. */
const LIVE_STATUSES: TicketStatus[] = ['overdue', 'in_progress', 'assigned', 'new', 'paused'];
const PER_STATUS = 20;
const RECENT_EVENTS = 8;

export function DashboardLive() {
  const objects = useObjectOptions();
  const assignees = useAssigneeOptions();
  const recent = useRecentNotifications(RECENT_EVENTS);

  const queries = useQueries({
    queries: LIVE_STATUSES.map((status) => ({
      queryKey: ['dashboard', 'live-tickets', status],
      queryFn: () => listTickets({ status, take: PER_STATUS }),
      refetchInterval: LIVE_POLL_MS,
      staleTime: 10_000,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.isError);
  const dataStamp = queries.map((q) => q.dataUpdatedAt).join(',');
  const tickets = useMemo(() => {
    const items: TicketListItem[] = [];
    for (const query of queries) items.push(...(query.data?.items ?? []));
    // Срочные сверху; внутри статуса — по последнему изменению.
    const rank = new Map(LIVE_STATUSES.map((status, index) => [status, index]));
    return items.sort((a, b) => {
      const byStatus = (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99);
      if (byStatus !== 0) return byStatus;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    // Зависимость от `queries` целиком перерисовывала бы список каждый рендер —
    // `useQueries` возвращает новый массив; смотрим на момент обновления данных.
  }, [dataStamp]);

  const objectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const object of objects.data?.items ?? []) map.set(object.id, object.name);
    return map;
  }, [objects.data]);

  const counts = useMemo(() => {
    const map = new Map<TicketStatus, number>();
    for (const ticket of tickets) map.set(ticket.status, (map.get(ticket.status) ?? 0) + 1);
    return map;
  }, [tickets]);

  return (
    <section className="grid gap-4 lg:grid-cols-[2fr_1fr]" data-testid="dashboard-live">
      <Card padded={false} testId="dashboard-live-tickets">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 md:px-6">
          <div>
            <div className="text-sm font-medium text-neutral-900">Заявки сейчас</div>
            <div className="text-xs text-neutral-500">
              открытые заявки · обновление каждые {LIVE_POLL_MS / 1000} с
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
            {LIVE_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <TicketStatusBadge status={status} />
                <span data-testid={`dashboard-live-count-${status}`}>{counts.get(status)}</span>
              </span>
            ))}
            <Link to={ROUTES.tickets} className="text-primary-600 hover:underline">
              Все заявки
            </Link>
          </div>
        </div>

        {failed ? (
          <div className="p-4">
            <ErrorBanner error={failed.error} onRetry={() => void failed.refetch()} />
          </div>
        ) : loading && tickets.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500">Загрузка…</div>
        ) : tickets.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-400" data-testid="dashboard-live-empty">
            Открытых заявок нет — все выполнены или закрыты.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {tickets.map((ticket) => {
              const assignee = userName(assignees.data?.items, ticket.assigneeId);
              const progress =
                ticket.operationsTotal && ticket.operationsTotal > 0
                  ? `${Math.min(ticket._count.operations, ticket.operationsTotal)}/${ticket.operationsTotal} операций`
                  : ticket._count.operations > 0
                    ? `${ticket._count.operations} операций`
                    : null;
              return (
                <li key={ticket.id} data-testid={`dashboard-live-ticket-${ticket.id}`}>
                  <Link
                    to={ROUTES.ticket(ticket.id)}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-neutral-50 md:px-6"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <TicketStatusBadge status={ticket.status} />
                      <TicketPriorityBadge
                        priority={ticket.priority}
                        label={TICKET_PRIORITY_LABELS[ticket.priority]}
                      />
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {ticket.description}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      <span>{objectNames.get(ticket.objectId) ?? shortId(ticket.objectId)}</span>
                      <span>
                        {assignee ??
                          (ticket.assigneeId ? shortId(ticket.assigneeId) : 'исполнитель не назначен')}
                      </span>
                      {progress && <span>{progress}</span>}
                      <span>изменена {formatDateTime(ticket.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card padded={false} testId="dashboard-live-events">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-neutral-900">Последние события</div>
            <div className="text-xs text-neutral-500">SOS, статусы заявок, сообщения</div>
          </div>
          <Link to={ROUTES.notifications} className="text-xs text-primary-600 hover:underline">
            Все
          </Link>
        </div>
        {recent.isError ? (
          <div className="px-4 py-6 text-sm text-danger-600">Не удалось загрузить события</div>
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-400">Событий пока нет</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.data?.items.map((item: NotificationEntity) => (
              <li key={item.id}>
                <Link
                  to={notificationTarget(item)}
                  className={[
                    'flex items-start gap-2 px-4 py-2.5 hover:bg-neutral-50',
                    item.readAt ? '' : 'bg-primary-50/60',
                  ].join(' ')}
                >
                  <span aria-hidden="true">{notificationTypeIcon(item.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-neutral-900">{item.title}</span>
                    <span className="line-clamp-2 block text-xs text-neutral-600">{item.body}</span>
                    <span className="block text-[11px] text-neutral-400">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
