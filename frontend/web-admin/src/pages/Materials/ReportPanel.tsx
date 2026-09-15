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
  Select,
  SoftWarning,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4">
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

        <div className="ml-auto text-right">
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
              <Table>
                <THead>
                  <Th className="min-w-[220px]">Материал</Th>
                  <Th className="w-[90px]">Единица</Th>
                  <Th className="w-[140px]" align="right">
                    Расход
                  </Th>
                  <Th className="w-[130px]" align="right">
                    Операций
                  </Th>
                  <Th className="w-[140px]" align="right">
                    Цена за ед., ₽
                  </Th>
                  <Th className="w-[150px]" align="right">
                    Стоимость, ₽
                  </Th>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <Tr key={row.materialId} testId={`report-row-${row.materialId}`}>
                      <Td>{row.name}</Td>
                      <Td>{row.unit}</Td>
                      <Td mono align="right">
                        {formatQuantity(row.consumedQuantity)}
                      </Td>
                      <Td mono align="right">
                        {row.operationsCount}
                      </Td>
                      <Td mono align="right">
                        {formatMoney(row.costPerUnit)}
                      </Td>
                      <Td mono align="right">
                        {formatMoney(row.cost)}
                      </Td>
                    </Tr>
                  ))}

                  <Tr className="bg-neutral-50 font-medium">
                    <Td>Итого</Td>
                    <Td />
                    <Td mono align="right">
                      {formatQuantity(totals?.consumedQuantity ?? 0)}
                    </Td>
                    <Td mono align="right">
                      {totals?.operationsCount ?? 0}
                    </Td>
                    <Td />
                    <Td mono align="right">
                      <span data-testid="report-total-cost-row">
                        {formatMoney(totals?.cost ?? 0)}
                      </span>
                    </Td>
                  </Tr>
                </TBody>
              </Table>
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
