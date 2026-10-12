import { Link } from 'react-router-dom';
import { Card, LoadingBlock } from '../../components/ui';
import { ROUTES } from '../../router/routes';
import type { TicketDetailEntity } from '../../types/tickets';
import { formatDateTime } from './ticketHelpers';
import {
  PROGRESS_BG,
  PROGRESS_LABELS,
  PROGRESS_TEXT,
  computeRouteProgress,
  type RouteProgressSummary,
} from './routeProgress';
import { useTicketRoute } from './useTickets';

/**
 * Карточка «Маршрут» в заявке (12.10.2026): цветовая индикация прохода
 * оператора по точкам. Серый — не начато (нулевой), жёлтый — в помещении
 * отмечены операции, зелёный — помещение завершено. Данные обновляются вместе
 * с заявкой (опрос карточки), ничего дополнительно нажимать не нужно.
 */
export function TicketRouteProgress({ ticket }: { ticket: TicketDetailEntity }) {
  const { route, routeId, isLoading, error, notFound } = useTicketRoute(ticket);

  if (ticket.type !== 'planned' && notFound) return null;
  if (isLoading) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-900">Маршрут</h2>
        <LoadingBlock label="Ищем маршрут смены…" />
      </Card>
    );
  }
  if (error || !route || !routeId) {
    return (
      <Card className="flex flex-col gap-2" testId="ticket-route-none">
        <h2 className="text-sm font-medium text-neutral-900">Маршрут</h2>
        <p className="text-xs text-neutral-400">
          {error
            ? 'Не удалось загрузить маршрут смены.'
            : 'К заявке не привязана смена с маршрутом — прогресс по помещениям недоступен.'}
        </p>
      </Card>
    );
  }

  const summary = computeRouteProgress(route, ticket);
  return (
    <Card className="flex flex-col gap-3" testId="ticket-route-progress">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-900">
          Маршрут ·{' '}
          <Link to={ROUTES.route(route.id)} className="text-primary-600 hover:underline">
            {route.name}
          </Link>
        </h2>
        <span className="text-xs text-neutral-500" data-testid="ticket-route-summary">
          помещений {summary.done} из {summary.total}
          {summary.active > 0 ? ` · в работе ${summary.active}` : ''}
        </span>
      </div>

      <RouteProgressBar summary={summary} />

      <ol className="flex flex-col gap-1.5" data-testid="ticket-route-points">
        {summary.points.map((point, index) => {
          const current = point.pointId === summary.currentPointId;
          return (
            <li
              key={point.pointId}
              data-testid={`ticket-route-point-${point.pointId}`}
              data-status={point.status}
              className={[
                'flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm',
                current ? 'bg-warning-50 ring-1 ring-warning-500/40' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
                  PROGRESS_BG[point.status],
                ].join(' ')}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-900">{point.roomName}</span>
              <span className={['shrink-0 text-xs', PROGRESS_TEXT[point.status]].join(' ')}>
                {point.status === 'done' && point.completedAt
                  ? `завершено ${formatDateTime(point.completedAt)}`
                  : point.status === 'active'
                    ? `в работе · операций ${point.operationsDone}`
                    : PROGRESS_LABELS[point.status]}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
        <Legend tone="pending" />
        <Legend tone="active" />
        <Legend tone="done" />
      </div>
    </Card>
  );
}

/** Полоса из сегментов по точкам маршрута: цвет каждого — состояние помещения. */
export function RouteProgressBar({ summary }: { summary: RouteProgressSummary }) {
  if (summary.total === 0) return null;
  return (
    <div
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={`Прогресс маршрута: ${summary.done} из ${summary.total} помещений`}
      data-testid="ticket-route-bar"
    >
      {summary.points.map((point) => (
        <span
          key={point.pointId}
          className={['h-full flex-1', PROGRESS_BG[point.status]].join(' ')}
          title={`${point.roomName}: ${PROGRESS_LABELS[point.status]}`}
        />
      ))}
    </div>
  );
}

function Legend({ tone }: { tone: 'pending' | 'active' | 'done' }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={['h-2.5 w-2.5 rounded-full', PROGRESS_BG[tone]].join(' ')} aria-hidden="true" />
      {PROGRESS_LABELS[tone]}
    </span>
  );
}
