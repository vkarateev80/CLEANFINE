import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorBanner, SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { EventStatusBadge, TicketStatusBadge } from '../../components/tickets/TicketBadges';
import { useObjectScopeContext } from '../../components/object/ObjectScopeContext';
import {
  DONE_TICKET_STATUSES,
  useConsumptionReport,
  useLowStocks,
  usePeriodEvents,
  usePeriodTickets,
  validatePeriod,
  type Period,
} from './useReportsData';
import type { ConsumptionReport, MaterialConsumptionRow, StockView } from '../../types/materials';
import type { TicketListItem } from '../../types/tickets';
import type { ScheduleEventEntity } from '../../types/schedule';
import {
  firstDayOfMonth,
  formatDate,
  formatDateShort,
  formatMoney,
  formatNumber,
  formatTime,
  scheduleToday,
  toDateInput,
} from '../../lib/format';

/**
 * Экран «Отчёты» (DS-004, `reports.md`): что фактически сделано на объекте за
 * период и сколько это съело ресурсов. Экран **только для чтения** — мутаций на
 * нём нет ни одной.
 *
 * Ответственность за точность цифр поделена честно: расход материалов считает
 * сервер (`GET /api/materials/report`), а по заявкам и сменам агрегат собирается
 * на клиенте — отдельных серверных отчётов в проекте нет (см. `useReportsData.ts`,
 * где зафиксированы оба ограничения API).
 *
 * Таб хранится в query-строке (`?tab=materials`), период — в `?from=&to=`: ссылку
 * на конкретный отчёт можно отправить менеджеру, а «назад» в браузере
 * восстанавливает состояние (reports.md п. 4.3).
 */

type Tab = 'summary' | 'cleaning' | 'materials';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Сводка' },
  { id: 'cleaning', label: 'Уборки' },
  { id: 'materials', label: 'Материалы' },
];

function previousMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function lastDayOfPreviousMonth(): string {
  const now = new Date();
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), 0));
}

export function ReportsPage() {
  const scope = useObjectScopeContext();
  const object = scope.object;
  const objectId = object?.id;
  const [params, setParams] = useSearchParams();

  const today = scheduleToday();
  const tab = (params.get('tab') as Tab | null) ?? 'summary';
  const from = params.get('from') ?? firstDayOfMonth();
  const to = params.get('to') ?? today;
  const period: Period = { from, to };

  const validation = validatePeriod(period, today);

  // Данные грузятся лениво: таб не запрашивает своё, пока не открыт (reports.md п. 7).
  const events = usePeriodEvents(objectId, period, validation.ok);
  const tickets = usePeriodTickets(objectId, validation.ok);
  const materials = useConsumptionReport(objectId, period, validation.ok && tab === 'materials');
  const lowStocks = useLowStocks(objectId, validation.ok && tab === 'materials');

  function updateParams(changes: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const stats = useMemo(
    () => aggregate(tickets.items, events.events, period),
    [events.events, period.from, period.to, tickets.items],
  );

  const nothingInPeriod =
    validation.ok &&
    !events.isLoading &&
    !tickets.isLoading &&
    stats.createdCount === 0 &&
    stats.shiftsCount === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="portal-reports">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">Отчёты</h1>
          <p className="text-sm text-neutral-500">
            {object?.name} ·{' '}
            <span className="font-mono">
              {formatDate(period.from)} — {formatDate(period.to)}
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] shrink-0"
          onClick={() => {
            void tickets.refetch();
            events.refetch();
            void materials.refetch();
            void lowStocks.refetch();
          }}
        >
          ⟳ Обновить
        </Button>
      </div>

      {/* ── Панель периода ─────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">Начало</span>
            <input
              type="date"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={from}
              max={to}
              onChange={(event) => updateParams({ from: event.target.value })}
              data-testid="portal-report-from"
            />
          </label>
          <span className="hidden pb-2 text-neutral-400 sm:block">—</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">Окончание</span>
            <input
              type="date"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={to}
              max={today}
              onChange={(event) => updateParams({ to: event.target.value })}
              data-testid="portal-report-to"
            />
          </label>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <QuickChip
            label="Текущий месяц"
            active={from === firstDayOfMonth() && to === today}
            onClick={() => updateParams({ from: firstDayOfMonth(), to: today })}
          />
          <QuickChip
            label="Прошлый месяц"
            active={from === firstDayOfMonth(previousMonth()) && to === lastDayOfPreviousMonth()}
            onClick={() =>
              updateParams({ from: firstDayOfMonth(previousMonth()), to: lastDayOfPreviousMonth() })
            }
          />
          <QuickChip
            label="30 дней"
            onClick={() =>
              updateParams({
                from: toDateInput(new Date(Date.now() - 29 * 86_400_000)),
                to: today,
              })
            }
          />
          <QuickChip
            label="90 дней"
            onClick={() =>
              updateParams({
                from: toDateInput(new Date(Date.now() - 89 * 86_400_000)),
                to: today,
              })
            }
          />
        </div>

        <p
          className={['mt-2 text-xs', validation.ok ? 'text-neutral-400' : 'text-danger-600'].join(
            ' ',
          )}
          data-testid="portal-report-period-hint"
        >
          {validation.ok ? 'Максимум 366 дней' : validation.message}
        </p>
      </Card>

      {/* ── Табы ───────────────────────────────────────────────────────── */}
      <div className="flex gap-4 overflow-x-auto border-b border-neutral-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => updateParams({ tab: item.id })}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-1 pb-2 text-sm',
              tab === item.id
                ? 'border-primary-600 font-medium text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-800',
            ].join(' ')}
            aria-current={tab === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!validation.ok && (
        <SoftWarning>
          Период не изменён: {validation.message}. Запросы не отправлены — исправьте даты.
        </SoftWarning>
      )}

      {validation.ok && tab === 'summary' && (
        <SummaryTab
          createdCount={stats.createdCount}
          doneCount={stats.doneCount}
          completedShifts={stats.completedShifts}
          missedShifts={stats.missedShifts}
          doneList={stats.doneList}
          loading={tickets.isLoading || events.isLoading}
          truncated={tickets.truncated}
          nothingInPeriod={nothingInPeriod}
          ticketsError={tickets.isError ? tickets.error : null}
          eventsError={events.isError}
          onRetryTickets={() => void tickets.refetch()}
          onRetryEvents={events.refetch}
        />
      )}

      {validation.ok && tab === 'cleaning' && (
        <CleaningTab
          events={events.events}
          loading={events.isLoading}
          isError={events.isError}
          onRetry={events.refetch}
          counts={{
            total: stats.shiftsCount,
            completed: stats.completedShifts,
            missed: stats.missedShifts,
          }}
        />
      )}

      {validation.ok && tab === 'materials' && (
        <MaterialsTab
          report={materials.data}
          loading={materials.isLoading}
          error={materials.isError ? materials.error : null}
          onRetry={() => void materials.refetch()}
          lowStocks={lowStocks.data?.items ?? []}
          period={period}
          objectName={object?.name ?? ''}
        />
      )}
    </div>
  );
}

/** Агрегат по заявкам и сменам периода (серверных агрегатов для них нет). */
function aggregate(items: TicketListItem[], events: ScheduleEventEntity[], period: Period) {
  const created = items.filter((ticket) => {
    const day = ticket.createdAt.slice(0, 10);
    return day >= period.from && day <= period.to;
  });
  const done = created.filter((ticket) => {
    if (!DONE_TICKET_STATUSES.includes(ticket.status)) return false;
    const day = (ticket.completedAt ?? ticket.updatedAt).slice(0, 10);
    return day >= period.from && day <= period.to;
  });
  return {
    createdCount: created.length,
    doneCount: done.length,
    doneList: done
      .slice()
      .sort((left, right) =>
        (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt),
      ),
    shiftsCount: events.length,
    completedShifts: events.filter((event) => event.status === 'CHECKED_OUT').length,
    missedShifts: events.filter((event) => event.status === 'MISSED').length,
  };
}

/** Кнопка быстрого выбора периода. */
function QuickChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-neutral-200 bg-white text-neutral-700',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Таб «Сводка» ──────────────────────────────────────────────────────────

function SummaryTab({
  createdCount,
  doneCount,
  completedShifts,
  missedShifts,
  doneList,
  loading,
  truncated,
  nothingInPeriod,
  ticketsError,
  eventsError,
  onRetryTickets,
  onRetryEvents,
}: {
  createdCount: number;
  doneCount: number;
  completedShifts: number;
  missedShifts: number;
  doneList: TicketListItem[];
  loading: boolean;
  truncated: boolean;
  nothingInPeriod: boolean;
  ticketsError: unknown;
  eventsError: boolean;
  onRetryTickets: () => void;
  onRetryEvents: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Заявок создано" value={createdCount} loading={loading} />
        <StatTile label="Выполнено" value={doneCount} loading={loading} />
        <StatTile label="Смен проведено" value={completedShifts} loading={loading} />
        <StatTile
          label="Неявок"
          value={missedShifts}
          loading={loading}
          negative={missedShifts > 0}
        />
      </div>

      {/*
        Предел клиентской агрегации показан пользователю: «молча неверная» цифра
        в отчёте хуже, чем честная подпись о неполноте (reports.md п. 7.2).
      */}
      {truncated && (
        <SoftWarning>
          Заявок больше предела клиентской агрегации — «Заявок создано» и «Выполнено» могут быть
          занижены. Точный отчёт требует серверного фильтра по датам.
        </SoftWarning>
      )}

      {ticketsError != null && <ErrorBanner error={ticketsError} onRetry={onRetryTickets} />}
      {eventsError && (
        <ErrorBanner
          error={new Error('Не удалось загрузить смены за период')}
          onRetry={onRetryEvents}
        />
      )}

      {nothingInPeriod ? (
        <EmptyState
          title="За выбранный период данных нет"
          hint="Измените период — например, выберите текущий месяц."
        />
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-neutral-900">Последние выполненные заявки</h2>
            <Link
              to="/tickets"
              className="rounded-md px-2 py-1 text-sm text-primary-600 hover:bg-primary-50"
            >
              Все заявки →
            </Link>
          </div>
          {doneList.length === 0 ? (
            <EmptyState title="За период выполненных заявок нет" />
          ) : (
            <Card padded={false}>
              {doneList.slice(0, 5).map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/tickets/${ticket.id}`}
                  className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-neutral-400">
                      {formatDateShort(ticket.completedAt ?? ticket.updatedAt)}
                    </div>
                    <div className="truncate text-sm text-neutral-900" title={ticket.description}>
                      {ticket.description}
                    </div>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </Link>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  loading,
  negative,
}: {
  label: string;
  value: number;
  loading?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex min-h-[88px] flex-col justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className="text-xs text-neutral-500">{label}</span>
      {loading ? (
        <span className="h-6 w-10 animate-pulse rounded bg-neutral-200" aria-hidden="true" />
      ) : (
        <span
          className={[
            'font-mono text-2xl font-semibold',
            negative ? 'text-warning-600' : 'text-neutral-900',
          ].join(' ')}
        >
          {formatNumber(value)}
        </span>
      )}
    </div>
  );
}

// ── Таб «Уборки» ──────────────────────────────────────────────────────────

function CleaningTab({
  events,
  loading,
  isError,
  onRetry,
  counts,
}: {
  events: ScheduleEventEntity[];
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  counts: { total: number; completed: number; missed: number };
}) {
  if (isError) {
    return (
      <ErrorBanner error={new Error('Не удалось загрузить смены за период')} onRetry={onRetry} />
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <EmptyState title="Смен в периоде нет" hint="Проверьте период или обратитесь к менеджеру." />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="portal-report-cleaning">
      <Card padded={false}>
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm text-neutral-900">
                {formatDate(event.date)} · {formatTime(event.plannedStart)}
              </div>
              <div className="truncate text-sm text-neutral-500" title={event.scheduleName}>
                {event.scheduleName}
              </div>
              <div className="font-mono text-xs text-neutral-400">
                {event.checkInAt && event.checkOutAt
                  ? `${formatTime(event.checkInAt)} → ${formatTime(event.checkOutAt)}`
                  : event.checkInAt
                    ? `${formatTime(event.checkInAt)} → не отмечено`
                    : 'не отмечено'}
              </div>
              {/* ФИО исполнителя не показываем: справочник `/api/users` закрыт для CLIENT. */}
              <div className="text-xs text-neutral-400">
                {event.userId ? 'исполнитель назначен' : 'исполнитель не назначен'}
              </div>
            </div>
            <EventStatusBadge status={event.status} />
          </div>
        ))}
      </Card>
      <p className="text-sm text-neutral-500">
        Смен: <span className="font-mono">{counts.total}</span>, проведено:{' '}
        <span className="font-mono">{counts.completed}</span>, неявок:{' '}
        <span className="font-mono">{counts.missed}</span>
      </p>
    </div>
  );
}

// ── Таб «Материалы» ───────────────────────────────────────────────────────

function MaterialsTab({
  report,
  loading,
  error,
  onRetry,
  lowStocks,
  period,
  objectName,
}: {
  report: ConsumptionReport | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  lowStocks: StockView[];
  period: Period;
  objectName: string;
}) {
  const [csvError, setCsvError] = useState<string | null>(null);
  const rows = report?.rows ?? [];

  if (error != null) {
    return <ErrorBanner error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="portal-report-materials">
      {rows.length === 0 ? (
        <EmptyState
          title="Списаний материалов за период не было"
          hint="Это нормальный случай: расход появляется после выполненных работ."
        />
      ) : (
        <>
          <Card padded={false}>
            <div className="border-b border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-900">
              Расход по объекту
            </div>
            {rows.map((row) => (
              <div
                key={row.materialId}
                className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-neutral-900" title={row.name}>
                    {row.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {row.unit} · операций: <span className="font-mono">{row.operationsCount}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="whitespace-nowrap font-mono text-sm text-neutral-900">
                    {formatNumber(row.consumedQuantity, 2)}
                  </div>
                  <div className="whitespace-nowrap font-mono text-xs text-neutral-500">
                    {formatMoney(row.cost)}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-3 font-medium">
              <span className="text-sm text-neutral-900">Итого</span>
              <div className="text-right">
                <div
                  className="whitespace-nowrap font-mono text-sm text-neutral-900"
                  data-testid="portal-report-total"
                >
                  {formatNumber(report?.totals.consumedQuantity ?? 0, 2)}
                </div>
                <div className="whitespace-nowrap font-mono text-xs text-neutral-600">
                  {formatMoney(report?.totals.cost ?? 0)}
                </div>
              </div>
            </div>
          </Card>
          <p className="text-xs text-neutral-500">
            Период:{' '}
            <span className="font-mono">
              {formatDate(period.from)} — {formatDate(period.to)}
            </span>
            {objectName && <> · объект: {objectName}</>}
          </p>
        </>
      )}

      {lowStocks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-neutral-900">Заканчивается на объекте</h2>
          <SoftWarning>Некоторые материалы на исходе — менеджер уведомлён.</SoftWarning>
          <Card padded={false}>
            {lowStocks.map((stock) => (
              <div
                key={stock.materialId}
                className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
              >
                <span className="truncate text-sm text-neutral-900">{stock.material.name}</span>
                <span className="whitespace-nowrap font-mono text-sm text-neutral-900">
                  {formatNumber(stock.quantity, 2)} {stock.material.unit}
                  <span className="text-xs text-neutral-500">
                    {' '}
                    / мин {formatNumber(stock.minStockThreshold, 2)}
                  </span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          className="min-h-[44px] w-full sm:w-auto"
          data-testid="portal-report-csv"
          onClick={() => {
            try {
              downloadCsv(rows, period, objectName);
              setCsvError(null);
            } catch (caught) {
              setCsvError(errorMessage(caught));
            }
          }}
        >
          Скачать CSV
        </Button>
        {csvError && <p className="text-xs text-danger-600">{csvError}</p>}
      </div>
    </div>
  );
}

/**
 * CSV формируется на клиенте (`reports.md` п. 7.4): разделитель `;` — Excel в
 * русской локали, UTF-8 с BOM — иначе Excel покажет кириллицу кракозябрами.
 */
function downloadCsv(rows: MaterialConsumptionRow[], period: Period, objectName: string): void {
  const header = ['Материал', 'Единица', 'Израсходовано', 'Операций', 'Стоимость'];
  const lines = rows.map((row) =>
    [
      row.name,
      row.unit,
      String(row.consumedQuantity),
      String(row.operationsCount),
      String(row.cost),
    ]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(';'),
  );
  const body = `\uFEFF${[header.join(';'), ...lines].join('\r\n')}`;
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `report-${objectName || 'object'}-${period.from}-${period.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
