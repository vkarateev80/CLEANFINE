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
            <div className="ml-auto">
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
                    источник: gps-service, PostGIS-геозоны
                  </span>
                </div>
                <Table>
                  <THead>
                    <Th className="min-w-[200px]">Сотрудник</Th>
                    <Th className="min-w-[220px]">Объект</Th>
                    <Th className="w-[120px]" align="right">
                      Посещений
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Появлений
                    </Th>
                    <Th className="w-[160px]" align="right">
                      Время на объекте
                    </Th>
                    <Th className="w-[170px]" align="right">
                      Первое появление
                    </Th>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr
                        key={`${row.userId}-${row.objectId}`}
                        testId={`report-geofence-row-${row.objectId}`}
                      >
                        <Td>{employeeLabel(row.userId, employeeNames)}</Td>
                        <Td>{objectLabel(row.objectId, objectNames)}</Td>
                        <Td mono align="right">
                          {row.visitsCount}
                        </Td>
                        <Td mono align="right">
                          {row.presenceCount}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.dwellMinutes)}
                        </Td>
                        <Td mono align="right">
                          {formatDateTime(row.firstEnteredAt)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
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
                <Table>
                  <THead>
                    <Th className="min-w-[200px]">Сотрудник</Th>
                    <Th className="w-[120px]">День</Th>
                    <Th className="w-[120px]" align="right">
                      Точек
                    </Th>
                    <Th className="w-[170px]" align="right">
                      Период трека
                    </Th>
                    <Th className="w-[140px]" align="right">
                      Объектов
                    </Th>
                  </THead>
                  <TBody>
                    {routes.slice(0, 30).map((row) => (
                      <Tr key={`${row.userId}-${row.day}`}>
                        <Td>{employeeLabel(row.userId, employeeNames)}</Td>
                        <Td mono>{formatDate(row.day)}</Td>
                        <Td mono align="right">
                          {formatNumber(row.pointsCount)}
                        </Td>
                        <Td mono align="right">
                          {formatMinutes(row.spanMinutes)}
                        </Td>
                        <Td mono align="right">
                          {row.objectsVisited}
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
