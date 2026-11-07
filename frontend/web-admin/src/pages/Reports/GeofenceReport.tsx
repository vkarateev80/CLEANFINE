import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ResponsiveTable,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import type { GeofenceControlReportRow, RouteActivityReportRow } from '../../types/reports';
import { GeofenceDailyChart } from './ReportCharts';
import { ReportFeedback, Metric } from './ReportFeedback';
import {
  buildCsv,
  csvFileName,
  downloadCsv,
  employeeLabel,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatNumber,
  objectLabel,
} from './reportsHelpers';
import { useGeofenceControlReport } from './useReports';

/** Вкладка «Геозоны и маршруты»: посещения объектов (PostGIS) и покрытие дня точками. */
export function GeofenceReport({
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
  const report = useGeofenceControlReport(staffQuery);
  const rows = report.data?.rows ?? [];
  const routes = report.data?.routes ?? [];
  const totals = report.data?.totals;

  function exportCsv() {
    downloadCsv(
      csvFileName('geozony-i-marshruty', from, to),
      buildCsv(
        [
          'Сотрудник',
          'Объект',
          'Посещений',
          'Появлений',
          'Время на объекте, мин',
          'Первое появление',
        ],
        rows.map((row) => [
          employeeLabel(row.userId, employeeNames),
          objectLabel(row.objectId, objectNames),
          row.visitsCount,
          row.presenceCount,
          row.dwellMinutes,
          row.firstEnteredAt,
        ]),
      ),
    );
  }

  /**
   * Колонки отчёта по геозонам: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона. Хуки строк остаются в табличных ячейках: примитив держит в
   * DOM и таблицу, и карточки, поэтому один id на два представления дал бы два
   * совпадения (см. `TableOnlyTestId` в UI-ките).
   */
  const columns: ResponsiveColumn<GeofenceControlReportRow>[] = [
    {
      key: 'employee',
      header: 'Сотрудник',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (row) => (
        <TableOnlyTestId id={`report-geofence-row-${row.objectId}`}>
          {employeeLabel(row.userId, employeeNames)}
        </TableOnlyTestId>
      ),
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
      key: 'visits',
      header: 'Посещений',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Посещений',
      cell: (row) => row.visitsCount,
    },
    {
      key: 'presence',
      header: 'Появлений',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Появлений',
      cell: (row) => row.presenceCount,
    },
    {
      key: 'dwell',
      header: 'Время на объекте',
      thClassName: 'w-[160px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Время на объекте',
      cell: (row) => formatMinutes(row.dwellMinutes),
    },
    {
      key: 'firstEntered',
      header: 'Первое появление',
      thClassName: 'w-[170px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Первое появление',
      cell: (row) => formatDateTime(row.firstEnteredAt),
    },
  ];

  /** Колонки второй таблицы: покрытие дня точками трека по маршруту. */
  const routeColumns: ResponsiveColumn<RouteActivityReportRow>[] = [
    {
      key: 'employee',
      header: 'Сотрудник',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (row) => employeeLabel(row.userId, employeeNames),
    },
    {
      key: 'day',
      header: 'День',
      thClassName: 'w-[120px]',
      mono: true,
      card: 'field',
      cardLabel: 'День',
      cell: (row) => formatDate(row.day),
    },
    {
      key: 'points',
      header: 'Точек',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Точек',
      cell: (row) => formatNumber(row.pointsCount),
    },
    {
      key: 'span',
      header: 'Период трека',
      thClassName: 'w-[170px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Период трека',
      cell: (row) => formatMinutes(row.spanMinutes),
    },
    {
      key: 'objects',
      header: 'Объектов',
      thClassName: 'w-[140px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Объектов',
      cell: (row) => row.objectsVisited,
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

      {!report.isError && report.isLoading && <LoadingBlock label="Считаем геозоны…" />}

      {!report.isError && !report.isLoading && (
        <>
          <Card className="flex flex-wrap items-end gap-6" testId="report-totals-geofences">
            <Metric
              label="Посещений объектов"
              value={String(totals?.visitsCount ?? 0)}
              testId="report-geofence-visits"
            />
            <Metric label="Время на объектах" value={formatMinutes(totals?.dwellMinutes ?? 0)} />
            <Metric label="Сотрудников с треком" value={String(totals?.trackedUsersCount ?? 0)} />
            <Metric label="Точек трека" value={formatNumber(totals?.pointsCount ?? 0)} />
            <div className="ml-auto max-md:ml-0">
              <Button
                variant="secondary"
                size="sm"
                data-testid="report-export-geofences"
                disabled={rows.length === 0}
                onClick={exportCsv}
              >
                Экспорт CSV
              </Button>
            </div>
          </Card>

          {rows.length === 0 && routes.length === 0 ? (
            <EmptyState
              title="Треков за период нет"
              hint="Отчёт строится по GPS-точкам и геозонам объектов: нужны треки за выбранный период"
            />
          ) : (
            <>
              <GeofenceDailyChart series={report.data?.series ?? []} />

              <Card padded={false}>
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Посещения объектов (порог 5 минут)
                  </h2>
                  <span className="text-xs text-neutral-400">
                    по GPS-отметкам в геозонах объектов
                  </span>
                </div>
                <ResponsiveTable<GeofenceControlReportRow>
                  items={rows}
                  getKey={(row) => `${row.userId}-${row.objectId}`}
                  columns={columns}
                />
              </Card>

              <Card padded={false} testId="report-route-activity">
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Активность по маршруту (покрытие дня точками)
                  </h2>
                  <span className="text-xs text-neutral-400">
                    маршрут — из графика смены, покрытие — из трека
                  </span>
                </div>
                <ResponsiveTable<RouteActivityReportRow>
                  items={routes.slice(0, 30)}
                  getKey={(row) => `${row.userId}-${row.day}`}
                  columns={routeColumns}
                  testId="report-route-activity-list"
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
