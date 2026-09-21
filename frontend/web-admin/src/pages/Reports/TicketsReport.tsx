import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components/ui';
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
            <div className="ml-auto">
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
                <Table>
                  <THead>
                    <Th className="min-w-[220px]">Объект</Th>
                    <Th className="w-[170px]">Тип</Th>
                    <Th className="w-[100px]" align="right">
                      Всего
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Выполнено
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Просрочено
                    </Th>
                    <Th className="w-[170px]" align="right">
                      Время цикла
                    </Th>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr
                        key={`${row.objectId}-${row.type}`}
                        testId={`report-ticket-row-${row.type}`}
                      >
                        <Td>{objectLabel(row.objectId, objectNames)}</Td>
                        <Td>{ticketTypeLabel(row.type)}</Td>
                        <Td mono align="right">
                          {row.ticketsCount}
                        </Td>
                        <Td mono align="right">
                          {row.completedCount}
                        </Td>
                        <Td mono align="right">
                          {row.overdueCount}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.avgCycleMinutes)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
