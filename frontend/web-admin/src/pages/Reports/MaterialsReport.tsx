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
import { ConsumptionDailyChart } from './ReportCharts';
import { ReportFeedback, Metric } from './ReportFeedback';
import {
  buildCsv,
  csvFileName,
  downloadCsv,
  formatMoney,
  formatNumber,
  objectLabel,
} from './reportsHelpers';
import { useConsumptionByObject, useConsumptionReport } from './useReports';

/** Вкладка «Расход материалов»: разрез «объект + материал», ряд по дням и экспорт CSV. */
export function MaterialsReport({
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
  const report = useConsumptionReport(rangeQuery);
  const byObject = useConsumptionByObject(rangeQuery);

  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;

  function exportCsv() {
    downloadCsv(
      csvFileName('rashod-materialov', from, to),
      buildCsv(
        ['Объект', 'Материал', 'Единица', 'Расход', 'Операций', 'Цена за ед., ₽', 'Стоимость, ₽'],
        rows.map((row) => [
          objectLabel(row.objectId, objectNames),
          row.name,
          row.unit,
          row.consumedQuantity,
          row.operationsCount,
          row.costPerUnit,
          row.cost,
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

      {!report.isError && report.isLoading && <LoadingBlock label="Считаем расход…" />}

      {!report.isError && !report.isLoading && (
        <>
          <Card className="flex flex-wrap items-end gap-6" testId="report-totals-materials">
            <Metric label="Израсходовано" value={formatNumber(totals?.consumedQuantity ?? 0)} />
            <Metric label="Операций" value={String(totals?.operationsCount ?? 0)} />
            <Metric
              label="Стоимость"
              value={`${formatMoney(totals?.cost ?? 0)} ₽`}
              testId="report-total-cost"
            />
            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                data-testid="report-export-materials"
                disabled={rows.length === 0}
                onClick={exportCsv}
              >
                Экспорт CSV
              </Button>
            </div>
          </Card>

          {rows.length === 0 ? (
            <EmptyState
              title="Расхода за период нет"
              hint="В отчёт попадают движения «Расход» и «Списание»: измените период или объект"
            />
          ) : (
            <>
              <ConsumptionDailyChart series={report.data?.series ?? []} />

              <Card padded={false}>
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Разрез по объектам и материалам
                  </h2>
                  <span className="text-xs text-neutral-400">источник: material-service</span>
                </div>
                <Table>
                  <THead>
                    <Th className="min-w-[200px]">Объект</Th>
                    <Th className="min-w-[200px]">Материал</Th>
                    <Th className="w-[90px]">Единица</Th>
                    <Th className="w-[130px]" align="right">
                      Расход
                    </Th>
                    <Th className="w-[120px]" align="right">
                      Операций
                    </Th>
                    <Th className="w-[150px]" align="right">
                      Стоимость, ₽
                    </Th>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr
                        key={`${row.objectId}-${row.materialId}`}
                        testId={`report-row-${row.materialId}`}
                      >
                        <Td>{objectLabel(row.objectId, objectNames)}</Td>
                        <Td>{row.name}</Td>
                        <Td>{row.unit}</Td>
                        <Td mono align="right">
                          {formatNumber(row.consumedQuantity)}
                        </Td>
                        <Td mono align="right">
                          {row.operationsCount}
                        </Td>
                        <Td mono align="right">
                          {formatMoney(row.cost)}
                        </Td>
                      </Tr>
                    ))}
                    <Tr className="bg-neutral-50 font-medium">
                      <Td>Итого</Td>
                      <Td />
                      <Td />
                      <Td mono align="right">
                        {formatNumber(totals?.consumedQuantity ?? 0)}
                      </Td>
                      <Td mono align="right">
                        {totals?.operationsCount ?? 0}
                      </Td>
                      <Td mono align="right">
                        <span data-testid="report-total-cost-row">
                          {formatMoney(totals?.cost ?? 0)}
                        </span>
                      </Td>
                    </Tr>
                  </TBody>
                </Table>
              </Card>

              <Card padded={false} testId="report-by-object">
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Итоги по объектам за всё время
                  </h2>
                  <span className="text-xs text-neutral-400">
                    read-модель report_material_consumption без периода
                  </span>
                </div>
                <Table>
                  <THead>
                    <Th className="min-w-[220px]">Объект</Th>
                    <Th className="min-w-[200px]">Материал</Th>
                    <Th className="w-[130px]" align="right">
                      Расход
                    </Th>
                    <Th className="w-[150px]" align="right">
                      Стоимость, ₽
                    </Th>
                  </THead>
                  <TBody>
                    {(byObject.data?.rows ?? []).slice(0, 20).map((row) => (
                      <Tr key={`all-${row.objectId}-${row.materialId}`}>
                        <Td>{objectLabel(row.objectId, objectNames)}</Td>
                        <Td>{row.name}</Td>
                        <Td mono align="right">
                          {formatNumber(row.consumedQuantity)}
                        </Td>
                        <Td mono align="right">
                          {formatMoney(row.cost)}
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
