import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ResponsiveTable,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import type { TicketExecutionRow } from '../../types/reports';
import { TicketDailyChart } from './ReportCharts';
import { ReportFeedback, Metric } from './ReportFeedback';
import {
  buildCsv,
  csvFileName,
  downloadCsv,
  formatMinutes,
  formatPercent,
  objectLabel,
  ticketTypeLabel,
} from './reportsHelpers';
import { useTicketExecutionReport } from './useReports';

/** Вкладка «Выполнение заявок»: количество, время цикла, просрочки. */
export function TicketsReport({
  rangeQuery,
  objectNames,
  from,
  to,
}: {
  rangeQuery: { objectId?: string; from: string; to: string };
  objectNames: Map<string, string>;
  from: string;
  to: string;
}) {
  const report = useTicketExecutionReport(rangeQuery);
  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;

  function exportCsv() {
    downloadCsv(
      csvFileName('vypolnenie-zayavok', from, to),
      buildCsv(
        ['Объект', 'Тип', 'Всего', 'Выполнено', 'Просрочено', 'Среднее время цикла, мин'],
        rows.map((row) => [
          objectLabel(row.objectId, objectNames),
          ticketTypeLabel(row.type),
          row.ticketsCount,
          row.completedCount,
          row.overdueCount,
          row.avgCycleMinutes,
        ]),
      ),
    );
  }

  /**
   * Колонки отчёта по заявкам: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона (сущность — объект, тип заявки и числа — поля карточки).
   *
   * Хук строки `report-ticket-row-<тип>` остаётся в табличной ячейке: примитив
   * держит в DOM и таблицу, и карточки, поэтому один id на оба представления дал бы
   * два совпадения (см. `TableOnlyTestId` в UI-ките).
   */
  const columns: ResponsiveColumn<TicketExecutionRow>[] = [
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (row) => (
        <TableOnlyTestId id={`report-ticket-row-${row.type}`}>
          {objectLabel(row.objectId, objectNames)}
        </TableOnlyTestId>
      ),
    },
    {
      key: 'type',
      header: 'Тип',
      thClassName: 'w-[170px]',
      card: 'field',
      cardLabel: 'Тип',
      cell: (row) => ticketTypeLabel(row.type),
    },
    {
      key: 'total',
      header: 'Всего',
      thClassName: 'w-[100px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Всего',
      cell: (row) => row.ticketsCount,
    },
    {
      key: 'completed',
      header: 'Выполнено',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Выполнено',
      cell: (row) => row.completedCount,
    },
    {
      key: 'overdue',
      header: 'Просрочено',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Просрочено',
      cell: (row) => row.overdueCount,
    },
    {
      key: 'cycle',
      header: 'Время цикла',
      thClassName: 'w-[170px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Время цикла',
      cell: (row) => formatMinutes(row.avgCycleMinutes),
    },
  ];

  return (
    <>
      <ReportFeedback
        error={report.error}
        isError={report.isError}
        isRefetchError={report.isRefetchError}
        refetch={() => void report.refetch()}
      />

      {!report.isError && report.isLoading && <LoadingBlock label="Считаем заявки…" />}

      {!report.isError && !report.isLoading && (
        <>
          <Card className="flex flex-wrap items-end gap-6" testId="report-totals-tickets">
            <Metric label="Заявок за период" value={String(totals?.ticketsCount ?? 0)} />
            <Metric label="Выполнено" value={String(totals?.completedCount ?? 0)} />
            <Metric
              label="Просрочено"
              value={String(totals?.overdueCount ?? 0)}
              testId="report-tickets-overdue"
            />
            <Metric
              label="Среднее время цикла"
              value={formatMinutes(totals?.avgCycleMinutes ?? null)}
            />
            <Metric label="Доля просрочек" value={formatPercent(totals?.overdueRate ?? 0)} />
            <div className="ml-auto max-md:ml-0">
              <Button
                variant="secondary"
                size="sm"
                data-testid="report-export-tickets"
                disabled={rows.length === 0}
                onClick={exportCsv}
              >
                Экспорт CSV
              </Button>
            </div>
          </Card>

          {rows.length === 0 ? (
            <EmptyState
              title="Заявок за период нет"
              hint="Отчёт строится по дню создания заявки — измените период или объект"
            />
          ) : (
            <>
              <TicketDailyChart series={report.data?.series ?? []} />

              <Card padded={false}>
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Разрез по объектам и типам
                  </h2>
                  <span className="text-xs text-neutral-400">источник: ticket-service</span>
                </div>
                <ResponsiveTable<TicketExecutionRow>
                  items={rows}
                  getKey={(row) => `${row.objectId}-${row.type}`}
                  columns={columns}
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
