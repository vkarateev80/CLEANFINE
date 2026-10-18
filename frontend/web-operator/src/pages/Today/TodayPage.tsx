import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SCHEDULE_EVENT_STATUS_LABELS, type ScheduleEventStatus } from '../../types/schedule';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner } from '../../components/ui/Feedback';
import { PushPromptBanner } from '../../components/shell/PushPromptBanner';
import { Sheet } from '../../components/ui/Sheet';
import { useHeaderTitle } from '../../hooks/useHeaderTitle';
import { useOnline } from '../../hooks/useOnline';
import { humanDate, localDate, localTime, plural, timeRange } from '../../lib/date';
import { countDonePoints, useProgressStore } from '../../stores/progressStore';
import { useUiStore } from '../../stores/uiStore';
import type { RouteDetail } from '../../types/core';
import type { ScheduleEvent } from '../../types/schedule';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  isClosedTicket,
  type TicketListItem,
} from '../../types/tickets';
import {
  pickCurrentEvent,
  useMyTickets,
  useObject,
  useRoute,
  useShiftActions,
  useTodayEvents,
} from './useToday';
import { t } from '../../i18n';

const STATUS_TONE: Record<ScheduleEventStatus, Tone> = {
  PLANNED: 'warning',
  CHECKED_IN: 'success',
  CHECKED_OUT: 'neutral',
  MISSED: 'danger',
};

/**
 * Главный экран (home_today.md): смены дня, отметки, маршрут и заявки.
 * Данные из кэша TanStack Query показываются сразу, сеть дозагружает.
 */
export function TodayPage() {
  const events = useTodayEvents();
  const current = useMemo(() => pickCurrentEvent(events.data ?? []), [events.data]);
  const object = useObject(current?.objectId);
  const route = useRoute(current?.routeId);
  const tickets = useMyTickets();
  const online = useOnline();

  const objectName = current?.objectName ?? object.data?.name ?? null;
  useHeaderTitle(objectName ? t('Сегодня · {objectName}', { objectName }) : t('Сегодня'));

  const dataUpdatedAt = events.dataUpdatedAt
    ? localTime(new Date(events.dataUpdatedAt).toISOString())
    : null;

  return (
    <div className="flex flex-col gap-4" data-testid="today_list">
      <div className="flex items-baseline justify-between">
        <div className="text-sm text-neutral-500">{humanDate()}</div>
        {!online && dataUpdatedAt && (
          <div className="text-xs text-warning-600" data-testid="today_cached_at">
            {t('Данные от {time}', { time: dataUpdatedAt })}
          </div>
        )}
      </div>

      {/* Push предлагается прямо здесь, а не только в профиле (12.10.2026). */}
      <PushPromptBanner />

      {events.isLoading && !events.data ? (
        <>
          <div className="h-36 animate-pulse rounded-xl bg-neutral-200" />
          <div className="h-36 animate-pulse rounded-xl bg-neutral-200" />
        </>
      ) : events.isError && !events.data ? (
        <ErrorBanner
          error={new Error(t('Не удалось загрузить смены'))}
          onRetry={() => void events.refetch()}
        />
      ) : (events.data ?? []).length === 0 ? (
        <EmptyState
          title={t('На смену сегодня вы не назначены')}
          hint={t('Смены назначает бригадир в графике')}
          action={
            <Button
              variant="secondary"
              className="min-h-[48px]"
              onClick={() => void events.refetch()}
              data-testid="today_empty_retry"
            >
              {t('Обновить')}
            </Button>
          }
        />
      ) : (
        <>
          {events.isError && (
            <ErrorBanner
              error={new Error(t('Не удалось обновить смены — показаны сохранённые'))}
              onRetry={() => void events.refetch()}
            />
          )}
          {(events.data ?? []).map((event) => (
            <ShiftCard
              key={event.id}
              event={event}
              isCurrent={event.id === current?.id}
              address={event.objectId === current?.objectId ? object.data?.address : undefined}
              route={event.routeId && event.routeId === current?.routeId ? route.data : undefined}
            />
          ))}
          {current && <ShiftActions event={current} />}
        </>
      )}

      <TicketsSection
        items={tickets.data?.items ?? []}
        total={tickets.data?.total ?? 0}
        isLoading={tickets.isLoading && !tickets.data}
        isError={tickets.isError && !tickets.data}
        onRetry={() => void tickets.refetch()}
      />
    </div>
  );
}

function ShiftCard({
  event,
  isCurrent,
  address,
  route,
}: {
  event: ScheduleEvent;
  isCurrent: boolean;
  address?: string;
  route?: RouteDetail;
}) {
  const donePoints = useProgressStore((s) => countDonePoints(s.points[event.id]));
  const pointsTotal = route?.points.length ?? 0;
  const routeLabel = event.routeId
    ? route
      ? t('Маршрут: {name} · {count} {rooms} · ~{minutes} мин', {
          name: route.name,
          count: pointsTotal,
          rooms: plural(pointsTotal, t('помещение'), t('помещения'), t('помещений')),
          minutes: route.totalEstimatedTimeMin,
        })
      : t('Маршрут: {name}', { name: event.routeName ?? '…' })
    : t('Маршрут не назначен');
  const routeButtonLabel = event.status === 'CHECKED_IN' ? t('Продолжить') : t('Маршрут');

  return (
    <section
      className={[
        'rounded-xl border bg-white p-4 shadow-sm',
        isCurrent ? 'border-primary-500' : 'border-neutral-200',
      ].join(' ')}
      data-testid={`today_shift_card_${event.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-neutral-900">{t('Смена · {name}', { name: event.scheduleName })}</h2>
        <Badge
          tone={STATUS_TONE[event.status]}
          testId={`today_status_${event.status.toLowerCase()}`}
        >
          {t(SCHEDULE_EVENT_STATUS_LABELS[event.status])}
        </Badge>
      </div>
      <div className="mt-1 text-sm text-neutral-500">
        <span className="font-mono">
          {timeRange(event.plannedStart, event.checkOutAt ?? event.plannedEnd)}
        </span>
        {event.objectName && <> · {event.objectName}</>}
        {address && <>, {address}</>}
      </div>
      <div className="mt-2 text-sm text-neutral-700" data-testid="today_route_summary">
        {routeLabel}
      </div>
      {pointsTotal > 0 && (
        <div className="mt-2" data-testid="today_route_progress">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full bg-primary-500"
              style={{ width: `${Math.min(100, (donePoints / pointsTotal) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {t('Пройдено {done} из {total}', { done: donePoints, total: pointsTotal })}
          </div>
        </div>
      )}
      {event.checkOutReason && (
        <div className="mt-2 text-xs text-warning-600">{event.checkOutReason}</div>
      )}
      {event.routeId && event.status !== 'MISSED' && (
        <Link to={`/route/${event.id}`} className="mt-3 block" data-testid="today_route_button">
          <Button
            variant={event.status === 'CHECKED_IN' ? 'primary' : 'secondary'}
            className="min-h-[48px] w-full"
          >
            {routeButtonLabel}
          </Button>
        </Link>
      )}
    </section>
  );
}

function ShiftActions({ event }: { event: ScheduleEvent }) {
  const actions = useShiftActions();
  const [confirmOut, setConfirmOut] = useState(false);

  if (event.status === 'MISSED') {
    return (
      <div
        className="rounded-xl border border-danger-500 bg-white p-4 text-sm text-danger-600"
        data-testid="today_checkin_hint"
      >
        {t('Вы не отметились на смене. Обратитесь к бригадиру.')}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      {event.status === 'PLANNED' && (
        <>
          <div
            className="flex items-center gap-2 text-sm text-neutral-700"
            data-testid="today_checkin_hint"
          >
            <span aria-hidden="true">⚠</span> {t('Вы ещё не вышли на смену')}
          </div>
          <Button
            variant="primary"
            className="mt-3 min-h-[48px] w-full"
            loading={actions.busy}
            onClick={() => actions.checkIn(event)}
            data-testid="today_checkin_button"
          >
            {t('Начать смену')}
          </Button>
          <div className="mt-2 text-center text-xs text-neutral-500">
            {t('Отметка возможна только в зоне объекта')}
          </div>
        </>
      )}
      {event.status === 'CHECKED_IN' && (
        <>
          <div className="text-sm text-neutral-700" data-testid="today_checkin_hint">
            {t('Смена открыта в {time}', { time: localTime(event.checkInAt) })}
          </div>
          <Button
            variant="secondary"
            className="mt-3 min-h-[48px] w-full"
            loading={actions.busy}
            onClick={() => setConfirmOut(true)}
            data-testid="today_checkout_button"
          >
            {t('Закрыть смену')}
          </Button>
        </>
      )}
      {event.status === 'CHECKED_OUT' && (
        <div className="text-sm text-neutral-700" data-testid="today_checkin_hint">
          {t('Смена закрыта в {time}', { time: localTime(event.checkOutAt) })}
        </div>
      )}
      {actions.message && (
        <div
          role="status"
          className={[
            'mt-3 rounded-lg border px-3 py-2 text-sm',
            actions.message.tone === 'error'
              ? 'border-danger-500 text-danger-600'
              : 'border-success-500 text-success-600',
          ].join(' ')}
          data-testid="today_action_message"
        >
          {actions.message.text}
        </div>
      )}
      <ConfirmDialog
        open={confirmOut}
        title={t('Закрыть смену?')}
        text={t('После закрытия отметить операции будет нельзя.')}
        confirmLabel={t('Закрыть')}
        loading={actions.busy}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => {
          setConfirmOut(false);
          actions.checkOut(event);
        }}
        testId="today_checkout_confirm"
      />
    </section>
  );
}

function priorityTone(priority: TicketListItem['priority']): string {
  if (priority === 'critical' || priority === 'high') return 'bg-danger-500';
  if (priority === 'normal') return 'bg-info-500';
  return 'bg-neutral-400';
}

function statusTone(status: TicketListItem['status']): Tone {
  if (status === 'in_progress' || status === 'assigned') return 'primary';
  if (status === 'completed' || status === 'verified' || status === 'closed') return 'success';
  if (status === 'overdue' || status === 'rejected') return 'danger';
  if (status === 'paused') return 'warning';
  return 'neutral';
}

function TicketsSection({
  items,
  total,
  isLoading,
  isError,
  onRetry,
}: {
  items: TicketListItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [opened, setOpened] = useState<TicketListItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  const active = items.filter((ticket) => !isClosedTicket(ticket));
  const closed = items.filter(isClosedTicket);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-neutral-900">{t('Мои заявки')}</h2>
        {items.length > 0 && (
          <button
            type="button"
            className="min-h-[44px] px-2 text-sm text-primary-600"
            onClick={() => setShowAll(true)}
            data-testid="today_tickets_all_button"
          >
            {t('Все →')}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-xl bg-neutral-200" />
      ) : isError ? (
        <ErrorBanner error={new Error(t('Не удалось загрузить заявки'))} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
          data-testid="today_tickets_empty_text"
        >
          {t('Заявок нет')}
        </div>
      ) : (
        <>
          {active.map((ticket) => (
            <TicketTile key={ticket.id} ticket={ticket} onOpen={() => setOpened(ticket)} />
          ))}
          {closed.length > 0 && (
            <button
              type="button"
              className="min-h-[44px] text-left text-xs text-neutral-500"
              onClick={() => setShowAll(true)}
            >
              {t('Закрытых заявок: {count}', { count: closed.length })}
            </button>
          )}
        </>
      )}

      <Sheet
        open={showAll}
        title={t('Мои заявки ({total})', { total })}
        onClose={() => setShowAll(false)}
        testId="today_tickets_sheet"
      >
        <div className="flex flex-col gap-2">
          {items.map((ticket) => (
            <TicketTile key={ticket.id} ticket={ticket} onOpen={() => setOpened(ticket)} />
          ))}
        </div>
      </Sheet>

      <TicketDetailSheet ticket={opened} onClose={() => setOpened(null)} />
    </section>
  );
}

function TicketTile({ ticket, onOpen }: { ticket: TicketListItem; onOpen: () => void }) {
  const deadline = ticket.completionDeadline ?? ticket.arrivalDeadline ?? ticket.reactionDeadline;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-sm hover:border-primary-500"
      data-testid={`today_ticket_tile_${ticket.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
          <span
            className={['h-2 w-2 shrink-0 rounded-full', priorityTone(ticket.priority)].join(' ')}
            aria-hidden="true"
          />
          <span className="truncate">
            {t(TICKET_PRIORITY_LABELS[ticket.priority])} · {t(TICKET_TYPE_LABELS[ticket.type])}
          </span>
        </span>
        <Badge tone={statusTone(ticket.status)}>{t(TICKET_STATUS_LABELS[ticket.status])}</Badge>
      </div>
      <div className="mt-1 line-clamp-2 text-sm text-neutral-900">{ticket.description}</div>
      {deadline && (
        <div className="mt-1 text-xs text-neutral-500">
          {t('до')}{' '}
          <span className="font-mono">
            {localDate(deadline)} {localTime(deadline)}
          </span>
        </div>
      )}
    </button>
  );
}

function TicketDetailSheet({
  ticket,
  onClose,
}: {
  ticket: TicketListItem | null;
  onClose: () => void;
}) {
  const showToast = useUiStore((s) => s.showToast);
  return (
    <Sheet open={Boolean(ticket)} title={t('Заявка')} onClose={onClose} testId="today_ticket_detail">
      {ticket && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(ticket.status)}>{t(TICKET_STATUS_LABELS[ticket.status])}</Badge>
            <Badge tone="neutral">{t(TICKET_TYPE_LABELS[ticket.type])}</Badge>
            <Badge
              tone={
                ticket.priority === 'critical' || ticket.priority === 'high' ? 'danger' : 'info'
              }
            >
              {t(TICKET_PRIORITY_LABELS[ticket.priority])}
            </Badge>
          </div>
          <p className="whitespace-pre-wrap text-neutral-900">{ticket.description}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs text-neutral-500">
            <dt>{t('Создана')}</dt>
            <dd className="font-mono text-neutral-900">
              {localDate(ticket.createdAt)} {localTime(ticket.createdAt)}
            </dd>
            {ticket.arrivalDeadline && (
              <>
                <dt>{t('Прибыть до')}</dt>
                <dd className="font-mono text-neutral-900">
                  {localDate(ticket.arrivalDeadline)} {localTime(ticket.arrivalDeadline)}
                </dd>
              </>
            )}
            {ticket.completionDeadline && (
              <>
                <dt>{t('Выполнить до')}</dt>
                <dd className="font-mono text-neutral-900">
                  {localDate(ticket.completionDeadline)} {localTime(ticket.completionDeadline)}
                </dd>
              </>
            )}
            <dt>{t('Операций отмечено')}</dt>
            <dd className="font-mono text-neutral-900">
              {ticket._count.operations}
              {ticket.operationsTotal !== null ? ` ${t('из {total}', { total: ticket.operationsTotal })}` : ''}
            </dd>
          </dl>
          <Link to={`/chats?ticket=${ticket.id}`} onClick={() => showToast(t('Открываю чат заявки'))}>
            <Button variant="secondary" className="min-h-[48px] w-full">
              {t('Чат заявки')}
            </Button>
          </Link>
        </div>
      )}
    </Sheet>
  );
}
