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
import { StaffDailyChart } from './ReportCharts';
import { ReportFeedback, Metric } from './ReportFeedback';
import {
  buildCsv,
  csvFileName,
  downloadCsv,
  employeeLabel,
  formatMinutes,
  formatPercent,
  objectLabel,
} from './reportsHelpers';
import { useStaffControlReport } from './useReports';

/** Вкладка «Контроль персонала»: check-in/check-out, явки, опоздания, длительность смен. */
export function StaffReport({
  staffQuery,
  employeeNames,
  objectNames,
  from,
  to,
}: {
  staffQuery: { objectId?: string; userId?: string; from: string; to: string };
  employeeNames: Map<string, string>;
  objectNames: Map<string, string>;
  from: string;
  to: string;
}) {
  const report = useStaffControlReport(staffQuery);
  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;

  function exportCsv() {
    downloadCsv(
      csvFileName('kontrol-personala', from, to),
      buildCsv(
        [
          'Сотрудник',
          'Смен',
          'Отметился',
          'Закрыл смену',
          'Пропустил',
          'Авто-закрытий',
          'Опозданий',
          'Отработано, мин',
          'Средняя смена, мин',
          'Макс. опоздание, мин',
        ],
        rows.map((row) => [
          employeeLabel(row.userId, employeeNames),
          row.shiftsCount,
          row.checkedInCount,
          row.checkedOutCount,
          row.missedCount,
          row.autoClosedCount,
          row.lateCount,
          row.workedMinutes,
          row.avgWorkedMinutes,
          row.maxLatenessMinutes,
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

      {!report.isError && report.isLoading && <LoadingBlock label="Считаем смены…" />}

      {!report.isError && !report.isLoading && (
        <>
          <Card className="flex flex-wrap items-end gap-6" testId="report-totals-staff">
            <Metric label="Смен за период" value={String(totals?.shiftsCount ?? 0)} />
            <Metric
              label="Отметились"
              value={String(totals?.checkedInCount ?? 0)}
              testId="report-staff-checked-in"
            />
            <Metric label="Пропущено" value={String(totals?.missedCount ?? 0)} />
            <Metric label="Опозданий" value={String(totals?.lateCount ?? 0)} />
            <Metric label="Авто-закрытий" value={String(totals?.autoClosedCount ?? 0)} />
            <Metric label="Явка" value={formatPercent(totals?.attendanceRate ?? 0)} />
            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                data-testid="report-export-staff"
                disabled={rows.length === 0}
                onClick={exportCsv}
              >
                Экспорт CSV
              </Button>
            </div>
          </Card>

          {rows.length === 0 ? (
            <EmptyState
              title="Смен за период нет"
              hint="Отчёт строится по дню смены — измените период, объект или сотрудника"
            />
          ) : (
            <>
              <StaffDailyChart series={report.data?.series ?? []} />

              <Card padded={false}>
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">Смены по сотрудникам</h2>
                  <span className="text-xs text-neutral-400">
                    источник: schedule-service (check-in/check-out)
                  </span>
                </div>
                <Table>
                  <THead>
                    <Th className="min-w-[220px]">Сотрудник</Th>
                    <Th className="w-[90px]" align="right">
                      Смен
                    </Th>
                    <Th className="w-[110px]" align="right">
                      Отметился
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Пропустил
                    </Th>
                    <Th className="w-[110px]" align="right">
                      Опоздал
                    </Th>
                    <Th className="w-[130px]" align="right">
                      Авто-закрытий
                    </Th>
                    <Th className="w-[140px]" align="right">
                      Отработано
                    </Th>
                    <Th className="w-[150px]" align="right">
                      Средняя смена
                    </Th>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr key={row.userId} testId={`report-staff-row-${row.userId}`}>
                        <Td>{employeeLabel(row.userId, employeeNames)}</Td>
                        <Td mono align="right">
                          {row.shiftsCount}
                        </Td>
                        <Td mono align="right">
                          {row.checkedInCount}
                        </Td>
                        <Td mono align="right">
                          {row.missedCount}
                        </Td>
                        <Td mono align="right">
                          {row.lateCount}
                        </Td>
                        <Td mono align="right">
                          {row.autoClosedCount}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.workedMinutes)}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.avgWorkedMinutes)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>

              <Card padded={false} testId="report-staff-by-object">
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">Смены по объектам</h2>
                  <span className="text-xs text-neutral-400">
                    объект и маршрут — из графика смены
                  </span>
                </div>
                <Table>
                  <THead>
                    <Th className="min-w-[200px]">Сотрудник</Th>
                    <Th className="min-w-[220px]">Объект</Th>
                    <Th className="w-[90px]" align="right">
                      Смен
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Отметился
                    </Th>
                    <Th className="w-[140px]" align="right">
                      Отработано
                    </Th>
                  </THead>
                  <TBody>
                    {(report.data?.byObject ?? []).slice(0, 30).map((row) => (
                      <Tr key={`${row.userId}-${row.objectId}-${row.routeId}`}>
                        <Td>{employeeLabel(row.userId, employeeNames)}</Td>
                        <Td>{objectLabel(row.objectId, objectNames)}</Td>
                        <Td mono align="right">
                          {row.shiftsCount}
                        </Td>
                        <Td mono align="right">
                          {row.checkedInCount}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.workedMinutes)}
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
