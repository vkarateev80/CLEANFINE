import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  ResponsiveTable,
  Select,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import type { MaterialConsumptionRow } from '../../types/materials';
import { apiStatus, formatMoney, formatQuantity, useParamWriter } from './materialsHelpers';
import { useObjectOptions, useReport } from './useMaterials';

/**
 * Вкладка «Отчёт по расходу»: агрегаты `OUT`/`WRITE_OFF` по материалам за объект
 * и период плюс итог по стоимости (`GET /api/materials/report`).
 *
 * Диаграмма — лёгкая CSS-гистограмма, а не графическая библиотека: `recharts` в
 * зависимостях web-admin нет, а ради одной диаграммы тянуть ~100 КБ рантайма в
 * бандл админки не оправдано. Гистограмма отвечает на единственный вопрос
 * экрана — «какой материал съедает бюджет» — и стоит несколько `<div>`.
 *
 * Порядок строк задаёт бэкенд: `cost` по убыванию (`MaterialsService.report`),
 * поэтому клиент его не пересортировывает.
 */

/** Сколько материалов показываем на диаграмме: больше — уже не читается. */
const CHART_ROWS = 8;

/** Строка отчёта; `{ total: true }` — итоговая строка, она идёт через тот же список. */
type ReportItem = MaterialConsumptionRow | { readonly total: true };

function isTotal(item: ReportItem): item is { readonly total: true } {
  return 'total' in item;
}

export function ReportPanel() {
  const [params] = useSearchParams();
  const write = useParamWriter();

  const objectId = params.get('rpObjectId') ?? '';
  const from = params.get('rpFrom') ?? '';
  const to = params.get('rpTo') ?? '';

  const objects = useObjectOptions();
  const query = useReport({
    ...(objectId === '' ? {} : { objectId }),
    ...(from === '' ? {} : { from }),
    ...(to === '' ? {} : { to }),
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const totals = query.data?.totals;
  const forbidden = apiStatus(query.error) === 403;
  const filtersActive = objectId !== '' || from !== '' || to !== '';

  /**
   * Колонки отчёта: `cell` — прежняя ячейка таблицы, `card` — роль в карточке
   * телефона. `rowTestId` не передан сознательно: `report-row-<id>` читает
   * существующий e2e (`toBeVisible`), а примитив рендерит таблицу и карточки в DOM
   * сразу — дубль id дал бы strict-ошибку. Хук строки остаётся в табличной ячейке.
   */
  const reportColumns: ResponsiveColumn<ReportItem>[] = [
    {
      key: 'material',
      header: 'Материал',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (item) =>
        isTotal(item) ? (
          'Итого'
        ) : (
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
      thClassName: 'w-[140px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Расход',
      cell: (item) =>
        formatQuantity(isTotal(item) ? (totals?.consumedQuantity ?? 0) : item.consumedQuantity),
    },
    {
      key: 'operations',
      header: 'Операций',
      thClassName: 'w-[130px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Операций',
      cell: (item) => (isTotal(item) ? (totals?.operationsCount ?? 0) : item.operationsCount),
    },
    {
      key: 'price',
      header: 'Цена за ед., ₽',
      thClassName: 'w-[140px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Цена за ед., ₽',
      cell: (item) => (isTotal(item) ? null : formatMoney(item.costPerUnit)),
    },
    {
      key: 'cost',
      header: 'Стоимость, ₽',
      thClassName: 'w-[150px]',
      align: 'right',
      mono: true,
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

  return (
    <div className="flex flex-col gap-4">
      {/* На телефоне фильтры — одной колонкой во всю ширину (см. MovementsPanel). */}
      <Card className="flex flex-wrap items-end gap-4 max-md:[&>*]:w-full">
        <Field label="Объект" htmlFor="report-object">
          <Select
            id="report-object"
            data-testid="report-object-filter"
            className="w-72"
            value={objectId}
            disabled={objects.isLoading}
            onChange={(event) => write({ rpObjectId: event.target.value || null })}
          >
            <option value="">Все объекты</option>
            {(objects.data?.items ?? []).map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="С" htmlFor="report-from">
          <Input
            id="report-from"
            data-testid="report-from"
            type="date"
            className="w-40"
            value={from}
            onChange={(event) => write({ rpFrom: event.target.value || null })}
          />
        </Field>

        <Field label="По" htmlFor="report-to">
          <Input
            id="report-to"
            data-testid="report-to"
            type="date"
            className="w-40"
            value={to}
            onChange={(event) => write({ rpTo: event.target.value || null })}
          />
        </Field>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => write({ rpObjectId: null, rpFrom: null, rpTo: null })}
          >
            Сбросить фильтры
          </Button>
        )}

        <div className="ml-auto text-right max-md:ml-0 max-md:text-left">
          <div className="text-xs text-neutral-500">Итог по стоимости</div>
          <div className="font-mono text-lg text-neutral-900" data-testid="report-total-cost">
            {formatMoney(totals?.cost ?? 0)} ₽
          </div>
        </div>
      </Card>

      {query.isError && (
        <ErrorBanner
          error={forbidden ? new Error('Недостаточно прав для просмотра отчёта') : query.error}
          onRetry={() => void query.refetch()}
        />
      )}

      {!query.isError && query.isRefetchError && (
        <SoftWarning>Данные отчёта могут быть неактуальны — обновите страницу.</SoftWarning>
      )}

      {!query.isError && query.isLoading && <LoadingBlock label="Считаем расход…" />}

      {!query.isError &&
        !query.isLoading &&
        (rows.length === 0 ? (
          <EmptyState
            title="Расхода нет"
            hint={
              filtersActive
                ? 'За выбранный период и объект списаний не было — измените фильтры'
                : 'В отчёт попадают движения «Расход» и «Списание»: оформите расход на вкладке остатков или завершите операцию техкарты'
            }
          />
        ) : (
          <>
            <ReportChart rows={rows.slice(0, CHART_ROWS)} />

            <Card padded={false}>
              {/*
                Итоговая строка — такой же элемент списка: примитив берёт только
                плоские списки, поэтому «Итого» передаётся последним элементом и
                через `rowClassName` получает прежнее оформление (`bg-neutral-50
                font-medium`). На телефоне она становится отдельной карточкой
                «Итого», а не теряется вместе с `<tfoot>`.
              */}
              <ResponsiveTable<ReportItem>
                items={[...rows, { total: true }]}
                getKey={(item) => (isTotal(item) ? '__total' : item.materialId)}
                columns={reportColumns}
                rowClassName={(item) => (isTotal(item) ? 'bg-neutral-50 font-medium' : '')}
              />
            </Card>
          </>
        ))}
    </div>
  );
}

/**
 * Гистограмма расхода по стоимости: полоса на материал, длина — доля от максимума.
 * Подписи — вне полосы, чтобы работать и на узком экране, а числа дублируют
 * таблицу ниже (диаграмма только расставляет акценты, а не заменяет данные).
 */
function ReportChart({ rows }: { rows: MaterialConsumptionRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...rows.map((row) => row.cost), 0);

  return (
    <Card testId="report-chart" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-700">
          Топ-{rows.length} материалов по стоимости расхода
        </h2>
        <span className="text-xs text-neutral-400">длина полосы — доля от максимума</span>
      </div>

      <div className="flex flex-col gap-2" role="list" aria-label="Расход по материалам">
        {rows.map((row) => {
          const share = max === 0 ? 0 : Math.round((row.cost / max) * 100);
          return (
            <div
              key={row.materialId}
              role="listitem"
              className="flex flex-col gap-1"
              onMouseEnter={() => setHovered(row.materialId)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-neutral-700">{row.name}</span>
                <span className="shrink-0 font-mono text-neutral-500">
                  {formatMoney(row.cost)} ₽ · {formatQuantity(row.consumedQuantity)} {row.unit}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={[
                    'h-full rounded-full transition-colors',
                    hovered === row.materialId ? 'bg-primary-600' : 'bg-primary-500',
                  ].join(' ')}
                  style={{ width: `${Math.max(share, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
