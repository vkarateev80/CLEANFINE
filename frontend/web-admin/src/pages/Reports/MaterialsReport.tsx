import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ResponsiveTable,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import type { ConsumptionReportRow } from '../../types/reports';
import { ConsumptionDailyChart } from './ReportCharts';
import { ReportFeedback, Metric } from './ReportFeedback';
import {
  buildCsv,
  csvFileName,
  downloadCsv,
  formatConsumedByUnit,
  formatMoney,
  formatNumber,
  objectLabel,
} from './reportsHelpers';
import { useConsumptionByObject, useConsumptionReport } from './useReports';

/** Строка отчёта; `{ total: true }` — итоговая строка, она идёт через тот же список. */
type ConsumptionItem = ConsumptionReportRow | { readonly total: true };

function isTotal(item: ConsumptionItem): item is { readonly total: true } {
  return 'total' in item;
}

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

  /**
   * Колонки разреза «объект + материал». Итоговая строка — такой же элемент
   * списка (см. комментарий у `<ResponsiveTable>`): примитив берёт плоские
   * списки, поэтому «Итого» передаётся последним элементом.
   */
  const columns: ResponsiveColumn<ConsumptionItem>[] = [
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[200px]',
      card: 'field',
      cardLabel: 'Объект',
      cell: (item) => (isTotal(item) ? null : objectLabel(item.objectId, objectNames)),
    },
    {
      key: 'material',
      header: 'Материал',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (item) =>
        isTotal(item) ? (
          'Итого'
        ) : (
          /* Хук строки остаётся в таблице: примитив держит в DOM и карточки — дубль
             id ломал бы строгие селекторы (см. `TableOnlyTestId` в UI-ките). */
          <TableOnlyTestId id={`report-row-${item.materialId}`}>{item.name}</TableOnlyTestId>
        ),
    },
    {
      key: 'unit',
      header: 'Единица',
      thClassName: 'w-[90px]',
      card: 'field',
      cardLabel: 'Единица',
      cell: (item) => (isTotal(item) ? null : item.unit),
    },
    {
      key: 'consumed',
      header: 'Расход',
      thClassName: 'w-[130px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Расход',
      // Итог — по единицам: литры со штуками не складываются.
      cell: (item) =>
        isTotal(item) ? formatConsumedByUnit(rows) : formatNumber(item.consumedQuantity),
    },
    {
      key: 'operations',
      header: 'Операций',
      thClassName: 'w-[120px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Операций',
      cell: (item) => (isTotal(item) ? (totals?.operationsCount ?? 0) : item.operationsCount),
    },
    {
      key: 'cost',
      header: 'Стоимость, ₽',
      thClassName: 'w-[150px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Стоимость, ₽',
      cell: (item) =>
        isTotal(item) ? (
          <TableOnlyTestId id="report-total-cost-row">
            {formatMoney(totals?.cost ?? 0)}
          </TableOnlyTestId>
        ) : (
          formatMoney(item.cost)
        ),
    },
  ];

  /** Колонки второй таблицы: итоги по объектам за всё время. */
  const byObjectColumns: ResponsiveColumn<ConsumptionReportRow>[] = [
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[220px]',
      card: 'field',
      cardLabel: 'Объект',
      cell: (row) => objectLabel(row.objectId, objectNames),
    },
    {
      key: 'material',
      header: 'Материал',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (row) => row.name,
    },
    {
      key: 'consumed',
      header: 'Расход',
      thClassName: 'w-[130px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Расход',
      cell: (row) => formatNumber(row.consumedQuantity),
    },
    {
      key: 'cost',
      header: 'Стоимость, ₽',
      thClassName: 'w-[150px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Стоимость, ₽',
      cell: (row) => formatMoney(row.cost),
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

      {!report.isError && report.isLoading && <LoadingBlock label="Считаем расход…" />}

      {!report.isError && !report.isLoading && (
        <>
          <Card className="flex flex-wrap items-end gap-6" testId="report-totals-materials">
            <Metric label="Израсходовано" value={formatConsumedByUnit(rows)} />
            <Metric label="Операций" value={String(totals?.operationsCount ?? 0)} />
            <Metric
              label="Стоимость"
              value={`${formatMoney(totals?.cost ?? 0)} ₽`}
              testId="report-total-cost"
            />
            <div className="ml-auto max-md:ml-0">
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
                  <span className="text-xs text-neutral-400">по списаниям материалов</span>
                </div>
                <ResponsiveTable<ConsumptionItem>
                  items={[...rows, { total: true }]}
                  getKey={(item) =>
                    isTotal(item) ? '__total' : `${item.objectId}-${item.materialId}`
                  }
                  columns={columns}
                  rowClassName={(item) => (isTotal(item) ? 'bg-neutral-50 font-medium' : '')}
                />
              </Card>

              <Card padded={false} testId="report-by-object">
                <div className="flex items-baseline justify-between gap-3 p-4">
                  <h2 className="text-sm font-medium text-neutral-700">
                    Итоги по объектам за всё время
                  </h2>
                  <span className="text-xs text-neutral-400">
                    без учёта выбранного периода
                  </span>
                </div>
                <ResponsiveTable<ConsumptionReportRow>
                  items={(byObject.data?.rows ?? []).slice(0, 20)}
                  getKey={(row) => `all-${row.objectId}-${row.materialId}`}
                  columns={byObjectColumns}
                  // Второй список на странице: свой контейнерный хук, чтобы
                  // канонический `card-list` остался однозначным (см. MapPage).
                  testId="report-by-object-list"
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
