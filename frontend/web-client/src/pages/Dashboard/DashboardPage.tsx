import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ObjectStatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorBanner, SoftWarning } from '../../components/ui/Feedback';
import { EventStatusBadge, TicketCard } from '../../components/tickets/TicketBadges';
import { useObjectScopeContext } from '../../components/object/ObjectScopeContext';
import {
  DONE_TICKET_STATUSES,
  OPEN_TICKET_STATUSES,
  TICKETS_FILTER_PATH,
  lastCompletedShift,
  nextShift,
  sortTicketsByDate,
  upcomingShifts,
  useRecentTickets,
  useTicketCounts,
  useUnreadMessages,
  useUpcomingEvents,
} from '../../api/queries';
import { listTickets } from '../../api/tickets';
import { getObjectDetail } from '../../api/core';
import { useQuery } from '@tanstack/react-query';
import { formatDateTimeShort, formatNumber } from '../../lib/format';
import type { ScheduleEventEntity } from '../../types/schedule';

/**
 * Главный экран портала — «Статус объекта» (DS-004, `dashboard.md`).
 *
 * Отвечает на три вопроса клиента без перехода в другие разделы: что сейчас с
 * объектом, что делается (ближайшие смены и последние заявки) и нужно ли что-то
 * от него (открытые заявки, непрочитанные сообщения).
 *
 * Правок на экране нет: объект клиент не редактирует (единственное действие —
 * «Создать заявку»).
 */
export function DashboardPage() {
  const scope = useObjectScopeContext();
  const object = scope.object;
  const objectId = object?.id;
  const now = new Date().toISOString();

  const tickets = useRecentTickets(objectId, 5);
  const openCount = useTicketCounts(objectId, OPEN_TICKET_STATUSES);
  const events = useUpcomingEvents(objectId);
  const unread = useUnreadMessages();

  /**
   * «Выполнено за 30 дней»: фильтра по датам в `GET /api/tickets` нет
   * (открытый вопрос `dashboard.md` п. 10.3), поэтому клиент берёт страницу
   * выполненных заявок и считает по `completedAt` на клиенте. Ограничение честно
   * показано `SoftWarning`, когда страница упирается в предел `take`.
   */
  const completed = useQuery({
    queryKey: ['tickets', 'completed-30d', objectId],
    queryFn: () => listTickets({ objectId, take: 100 }),
    enabled: Boolean(objectId),
    staleTime: 30_000,
  });

  const completedStats = useMemo(() => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const items = completed.data?.items ?? [];
    const inPeriod = items.filter(
      (ticket) =>
        DONE_TICKET_STATUSES.includes(ticket.status) &&
        (ticket.completedAt ?? ticket.updatedAt) >= since,
    );
    return {
      count: inPeriod.length,
      // Предел клиентской агрегации: 100 заявок за раз — страховка от «молчаливо
      // неверной» цифры на большом объекте.
      truncated: (completed.data?.total ?? 0) > items.length && items.length >= 100,
    };
  }, [completed.data]);

  const eventsList = events.data ?? [];
  const next = nextShift(eventsList, now);
  const last = lastCompletedShift(eventsList);
  const upcoming = upcomingShifts(eventsList, now).slice(0, 3);

  /**
   * Счётчик помещений: складывается из `floors[].rooms` — в `Object` такого поля
   * нет, поэтому нужен `GET /api/objects/:id/detail`. Блок в паспорте не
   * рендерится, пока деталь не загрузилась (DS-004, `dashboard.md` п. 4.2:
   * «если загружаем деталь»).
   */
  const detail = useQuery({
    queryKey: ['object', objectId, 'detail'],
    queryFn: () => getObjectDetail(objectId as string),
    enabled: Boolean(objectId),
    staleTime: 60_000,
  });
  const roomsCount = detail.data
    ? detail.data.floors.reduce((sum, floor) => sum + floor.rooms.length, 0)
    : null;

  const archived = object?.status === 'ARCHIVED';
  const paused = object?.status === 'PAUSED';

  return (
    <div className="flex flex-col gap-4" data-testid="portal-dashboard">
      {/* ── Шапка объекта ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">
            {object?.name ?? 'Объект'}
          </h1>
          {object && <ObjectStatusBadge status={object.status} />}
        </div>
        <p className="line-clamp-2 text-sm text-neutral-500" title={object?.address}>
          {object?.address}
        </p>
      </div>

      {archived && (
        <div className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Объект в архиве. Обслуживание приостановлено.
        </div>
      )}
      {paused && (
        <SoftWarning>
          Обслуживание приостановлено. Данные показаны по последнему состоянию.
        </SoftWarning>
      )}

      {/* ── Паспорт объекта ───────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Detail label="Тип" value={object?.type ?? '—'} />
          <Detail
            label="Площадь"
            value={object ? `${formatNumber(object.totalArea, 1)} м²` : '—'}
            mono
          />
          <Detail label="Этажей" value={object ? String(object.floorsCount) : '—'} mono />
          <Detail
            label="Следующая уборка"
            value={next ? formatDateTimeShort(next.plannedStart) : 'не запланирована'}
            mono={Boolean(next)}
            muted={!next}
          />
          {last?.checkOutAt && (
            <Detail label="Последняя уборка" value={formatDateTimeShort(last.checkOutAt)} mono />
          )}
          {roomsCount !== null && <Detail label="Помещений" value={String(roomsCount)} mono />}
        </div>
      </Card>

      {/* ── KPI-плитки ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Открытые заявки"
          value={openCount.total}
          loading={openCount.isLoading}
          to={TICKETS_FILTER_PATH.open}
          accent={openCount.total > 0}
          error={openCount.isError ? 'Не удалось посчитать открытые заявки' : null}
        />
        <KpiTile
          label="Выполнено за 30 дней"
          value={completedStats.count}
          loading={completed.isLoading}
          to={TICKETS_FILTER_PATH.done}
        />
        <KpiTile
          label="Ближайшая смена"
          display={next ? formatDateTimeShort(next.plannedStart) : 'нет'}
          loading={events.isLoading}
          to="/reports"
        />
        <KpiTile
          label="Непрочитанных сообщений"
          value={unread.total}
          loading={unread.isLoading}
          to="/chat"
          accent={unread.total > 0}
        />
      </div>

      {completedStats.truncated && (
        <SoftWarning>
          Выполненные заявки показаны не полностью (первые 100): цифра «Выполнено за 30 дней» может
          быть занижена. Точный отчёт требует серверного фильтра по датам.
        </SoftWarning>
      )}

      {/* ── Ближайшие смены ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-neutral-900">Ближайшие смены</h2>
        {events.isError ? (
          <ErrorBanner error={events.error} onRetry={() => void events.refetch()} />
        ) : archived ? (
          <EmptyState
            title="Обслуживание приостановлено"
            hint="Смены по объекту в архиве не планируются."
          />
        ) : events.isLoading ? (
          <SkeletonList rows={2} />
        ) : upcoming.length === 0 ? (
          <EmptyState title="Уборок пока не запланировано" hint="Менеджер добавит график." />
        ) : (
          <Card padded={false}>
            {upcoming.map((event) => (
              <ShiftRow key={event.id} event={event} />
            ))}
          </Card>
        )}
      </section>

      {/* ── Последние заявки ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-900">Последние заявки</h2>
          <Link
            to="/tickets"
            className="rounded-md px-2 py-1 text-sm text-primary-600 hover:bg-primary-50"
          >
            Все →
          </Link>
        </div>
        {tickets.isError ? (
          <ErrorBanner error={tickets.error} onRetry={() => void tickets.refetch()} />
        ) : tickets.isLoading ? (
          <SkeletonList rows={2} />
        ) : (tickets.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Заявок пока нет"
            hint="Опишите проблему — менеджер получит заявку сразу."
            action={
              <Link to="/tickets?new=1">
                <Button variant="primary" className="min-h-[44px]">
                  Создать заявку
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {sortTicketsByDate(tickets.data?.items ?? []).map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </section>

      {/* ── Плавающая кнопка: над таб-баром, не перекрывает последнюю карточку ── */}
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-10 mt-2 lg:static lg:self-end">
        <Link to="/tickets?new=1" className="block">
          <Button
            variant="primary"
            size="lg"
            className="min-h-[44px] w-full shadow-lg lg:w-auto"
            data-testid="portal-ticket-create"
          >
            + Создать заявку
          </Button>
        </Link>
      </div>
    </div>
  );
}

/** Строка «подпись — значение» паспорта. `font-mono` — для чисел и дат. */
function Detail({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span
        className={[
          'text-sm',
          mono ? 'font-mono' : '',
          muted ? 'text-neutral-400' : 'text-neutral-900',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * KPI-плитка: подпись, значение, переход в раздел. Акцентная заливка —
 * `bg-primary-50` (мягких статусных `*-50` в токенах нет, см. README DS-004 п. 2).
 */
function KpiTile({
  label,
  value,
  display,
  loading,
  to,
  accent,
  error,
}: {
  label: string;
  value?: number;
  display?: string;
  loading?: boolean;
  to: string;
  accent?: boolean;
  error?: string | null;
}) {
  return (
    <Link
      to={to}
      className={[
        'flex min-h-[88px] flex-col justify-between gap-2 rounded-xl border border-neutral-200 p-4 shadow-sm transition-colors',
        accent ? 'bg-primary-50' : 'bg-white hover:border-primary-500',
      ].join(' ')}
    >
      <span className={['text-xs', accent ? 'text-primary-700' : 'text-neutral-500'].join(' ')}>
        {label}
      </span>
      {loading ? (
        <span className="h-6 w-10 animate-pulse rounded bg-neutral-200" aria-hidden="true" />
      ) : (
        <span className="font-mono text-2xl font-semibold text-neutral-900">
          {display ?? String(value ?? 0)}
        </span>
      )}
      {error && <span className="text-[10px] text-danger-600">{error}</span>}
    </Link>
  );
}

/** Строка списка смен: клик ведёт в отчёты — отдельного экрана смены в DS-004 нет. */
function ShiftRow({ event }: { event: ScheduleEventEntity }) {
  return (
    <Link
      to="/reports?tab=cleaning"
      className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
    >
      <div className="min-w-0">
        <div className="font-mono text-sm text-neutral-900">
          {formatDateTimeShort(event.plannedStart)}
        </div>
        <div className="truncate text-sm text-neutral-500" title={event.scheduleName}>
          {event.scheduleName}
        </div>
        {event.checkInAt && (
          <div className="text-xs text-neutral-400">
            приступили {formatDateTimeShort(event.checkInAt).slice(6)}
          </div>
        )}
      </div>
      <EventStatusBadge status={event.status} />
    </Link>
  );
}

/** Скелетон списка: держит высоту блока, чтобы вёрстка не «прыгала» на телефоне. */
function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-neutral-200" />
      ))}
    </div>
  );
}
