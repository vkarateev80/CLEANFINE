import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ResponsiveTable,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import type { StaffByObjectRow, StaffControlReportRow } from '../../types/reports';
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

  /**
   * Колонки отчёта по персоналу: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона (сущность — сотрудник, все числа — поля «подпись — значение»).
   * Хук строки остаётся в табличной ячейке: примитив рендерит таблицу и карточки в
   * DOM сразу, дубль id ломал бы строгие селекторы (см. `TableOnlyTestId` в UI-ките).
   */
  const columns: ResponsiveColumn<StaffControlReportRow>[] = [
    {
      key: 'employee',
      header: 'Сотрудник',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (row) => (
        <TableOnlyTestId id={`report-staff-row-${row.userId}`}>
          {employeeLabel(row.userId, employeeNames)}
        </TableOnlyTestId>
      ),
    },
    {
      key: 'shifts',
      header: 'Смен',
      thClassName: 'w-[90px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Смен',
      cell: (row) => row.shiftsCount,
    },
    {
      key: 'checkedIn',
      header: 'Отметился',
      thClassName: 'w-[110px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Отметился',
      cell: (row) => row.checkedInCount,
    },
    {
      key: 'missed',
      header: 'Пропустил',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Пропустил',
      cell: (row) => row.missedCount,
    },
    {
      key: 'late',
      header: 'Опоздал',
      thClassName: 'w-[110px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Опоздал',
      cell: (row) => row.lateCount,
    },
    {
      key: 'autoClosed',
      header: 'Авто-закрытий',
      thClassName: 'w-[130px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Авто-закрытий',
      cell: (row) => row.autoClosedCount,
    },
    {
      key: 'worked',
      header: 'Отработано',
      thClassName: 'w-[140px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Отработано',
      cell: (row) => formatMinutes(row.workedMinutes),
    },
    {
      key: 'avg',
      header: 'Средняя смена',
      thClassName: 'w-[150px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Средняя смена',
      cell: (row) => formatMinutes(row.avgWorkedMinutes),
    },
  ];

  /** Колонки второй таблицы: те же смены в разрезе объектов. */
  const byObjectColumns: ResponsiveColumn<StaffByObjectRow>[] = [
    {
      key: 'employee',
      header: 'Сотрудник',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (row) => employeeLabel(row.userId, employeeNames),
    },
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[220px]',
      card: 'field',
      cardLabel: 'Объект',
      cell: (row) => objectLabel(row.objectId, objectNames),
    },
    {
      key: 'shifts',
      header: 'Смен',
      thClassName: 'w-[90px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Смен',
      cell: (row) => row.shiftsCount,
    },
    {
      key: 'checkedIn',
      header: 'Отметился',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Отметился',
      cell: (row) => row.checkedInCount,
    },
    {
      key: 'worked',
      header: 'Отработано',
      thClassName: 'w-[140px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Отработано',
      cell: (row) => formatMinutes(row.workedMinutes),
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
            <div className="ml-auto max-md:ml-0">
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
                    по отметкам прихода и ухода
                  </span>
                </div>
                <ResponsiveTable<StaffControlReportRow>
                  items={rows}
                  getKey={(row) => row.userId}
                  columns={columns}
                />
              </Card>

              <Card padded={false} testId="report-staff-by-object">
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">Смены по объектам</h2>
                  <span className="text-xs text-neutral-400">
                    объект и маршрут — из графика смены
                  </span>
                </div>
                <ResponsiveTable<StaffByObjectRow>
                  items={(report.data?.byObject ?? []).slice(0, 30)}
                  getKey={(row) => `${row.userId}-${row.objectId}-${row.routeId}`}
                  columns={byObjectColumns}
                  testId="report-staff-by-object-list"
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
