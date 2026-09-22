import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  ResponsiveTable,
  Select,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { useCanMoveMaterials } from '../../hooks/usePermissions';
import { StockLevelBadge, apiStatus, formatMoney, formatQuantity, shortId, useParamWriter } from './materialsHelpers';
import type { StockView } from '../../types/materials';
import type { MovementPreset } from './MovementModal';
import { useObjectOptions, useStocks } from './useMaterials';

/**
 * Вкладка «Остатки»: выбор объекта → таблица остатков с подсветкой позиций ниже
 * порога и переключателем «только ниже порога».
 *
 * Признак `belowThreshold` приходит с бэкенда (`MaterialsService.toStockView`):
 * клиент не сравнивает `quantity` с порогом сам, иначе правило порога
 * существовало бы в двух местах и расходилось при изменении.
 *
 * Объект необязателен: без него сервис отдаёт остатки по всем объектам, и в
 * таблице появляется колонка «Объект» — это удобно для сводного взгляда по складу.
 */

export function StocksPanel({ onMove }: { onMove: (preset: MovementPreset) => void }) {
  const [params] = useSearchParams();
  const write = useParamWriter();
  const canMove = useCanMoveMaterials();

  const objectId = params.get('stockObjectId') ?? '';
  const onlyLow = params.get('stockLow') === '1';

  const objects = useObjectOptions();
  const query = useStocks({
    ...(objectId === '' ? {} : { objectId }),
    ...(onlyLow ? { onlyLow: true as const } : {}),
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const belowCount = useMemo(() => items.filter((item) => item.belowThreshold).length, [items]);
  const stockValue = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.material.costPerUnit, 0),
    [items],
  );

  const objectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const object of objects.data?.items ?? []) map.set(object.id, object.name);
    return map;
  }, [objects.data]);

  const forbidden = apiStatus(query.error) === 403;

  function objectLabel(id: string): string {
    return objectNames.get(id) ?? shortId(id);
  }

  /**
   * Колонки списка остатков: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона. Порядок и классы колонок сохранены как были, поэтому
   * tablet/desktop выглядят прежним образом.
   */
  const columns: ResponsiveColumn<StockView>[] = [
    {
      key: 'material',
      header: 'Материал',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (stock) => (
        <>
          <TableOnlyTestId id={`stock-row-${stock.materialId}`}>
            <span
              className={
                stock.belowThreshold ? 'block text-danger-600' : 'block text-neutral-900'
              }
            >
              {stock.material.name}
            </span>
          </TableOnlyTestId>
          <span className="block font-mono text-xs font-normal text-neutral-400">
            {stock.material.unit}
          </span>
        </>
      ),
    },
    ...(objectId === ''
      ? [
          {
            key: 'object',
            header: 'Объект',
            thClassName: 'w-[200px]',
            card: 'field' as const,
            cardLabel: 'Объект',
            cell: (stock: StockView) => objectLabel(stock.objectId),
          },
        ]
      : []),
    {
      key: 'quantity',
      header: 'Остаток',
      thClassName: 'w-[130px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Остаток',
      /*
       * `data-testid` остатка читается существующим e2e строго (`toHaveText`),
       * поэтому он остаётся только в табличной ячейке — карточка показывает то
       * же число без хука (см. `TableOnlyTestId` в UI-ките).
       */
      cell: (stock) => (
        <TableOnlyTestId id={`stock-quantity-${stock.materialId}`}>
          <span className={stock.belowThreshold ? 'text-danger-600' : ''}>
            {formatQuantity(stock.quantity)}
          </span>
        </TableOnlyTestId>
      ),
    },
    {
      key: 'threshold',
      header: 'Порог',
      thClassName: 'w-[110px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Порог',
      cell: (stock) => formatQuantity(stock.minStockThreshold),
    },
    {
      key: 'status',
      header: 'Статус',
      thClassName: 'w-[150px]',
      card: 'badge',
      cell: (stock) => <StockLevelBadge belowThreshold={stock.belowThreshold} />,
    },
    {
      key: 'price',
      header: 'Цена, ₽',
      thClassName: 'w-[130px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Цена, ₽',
      cell: (stock) => formatMoney(stock.material.costPerUnit),
    },
    {
      key: 'cost',
      header: 'Стоимость, ₽',
      thClassName: 'w-[140px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Стоимость, ₽',
      cell: (stock) => formatMoney(stock.quantity * stock.material.costPerUnit),
    },
    ...(canMove
      ? [
          {
            key: 'actions',
            header: 'Действия',
            thClassName: 'w-[120px]',
            align: 'right' as const,
            card: 'actions' as const,
            cell: (stock: StockView) => (
              <TableOnlyTestId id={`stock-move-${stock.materialId}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onMove({
                      materialId: stock.materialId,
                      objectId: stock.objectId,
                      type: 'OUT',
                    })
                  }
                >
                  Движение
                </Button>
              </TableOnlyTestId>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-4">
        {/* На телефоне подпись и селект встают в столбик: `w-72` (288 px) плюс
            подпись не помещаются в 360 px и распирали бы карточку фильтров. */}
        <label className="flex items-center gap-2 text-sm text-neutral-600 max-md:w-full max-md:flex-col max-md:items-stretch max-md:gap-1">
          Объект
          <Select
            data-testid="stocks-object-filter"
            aria-label="Объект остатков"
            className="w-72 max-md:w-full"
            value={objectId}
            disabled={objects.isLoading}
            onChange={(event) => write({ stockObjectId: event.target.value || null })}
          >
            <option value="">Все объекты</option>
            {(objects.data?.items ?? []).map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </label>

        <Checkbox
          label="Только ниже порога"
          data-testid="stocks-only-low"
          checked={onlyLow}
          onChange={(event) => write({ stockLow: event.target.checked ? '1' : null })}
        />

        <span className="ml-auto font-mono text-xs text-neutral-500 max-md:ml-0">
          позиций {total} · ниже порога {belowCount} · стоимость остатка{' '}
          {formatMoney(stockValue)} ₽
        </span>
      </Card>

      {query.isError && (
        <ErrorBanner
          error={forbidden ? new Error('Недостаточно прав для просмотра остатков') : query.error}
          onRetry={() => void query.refetch()}
        />
      )}

      {!query.isError && query.isRefetchError && (
        <SoftWarning>Остатки могут быть неактуальны — обновите страницу.</SoftWarning>
      )}

      {!query.isError && query.isLoading && <LoadingBlock label="Читаем остатки…" />}

      {!query.isError &&
        !query.isLoading &&
        (items.length === 0 ? (
          <EmptyState
            title={onlyLow ? 'Ниже порога ничего нет' : 'Остатков пока нет'}
            hint={
              onlyLow
                ? 'Все позиции по выбранному объекту в норме — снимите фильтр, чтобы увидеть весь склад'
                : 'Остаток появляется после первого движения по паре «материал — объект»'
            }
            action={
              onlyLow ? (
                <Button variant="secondary" size="sm" onClick={() => write({ stockLow: null })}>
                  Показать все позиции
                </Button>
              ) : null
            }
          />
        ) : (
          <Card padded={false}>
            {/*
              Остатки: таблица на md+ и карточки на телефоне. Колонка «Объект»
              появляется только в режиме «Все объекты» — примитив считает `colSpan`
              пустого состояния сам, ручного счётчика колонок больше нет.

              `rowTestId` не передан (см. `TableOnlyTestId` в UI-ките): id строки и ячейки
              остатка читает существующий e2e, а примитив рендерит оба представления
              в DOM — дубль id сломал бы строгие селекторы.
            */}
            <ResponsiveTable<StockView>
              items={items}
              getKey={(stock) => `${stock.materialId}-${stock.objectId}`}
              columns={columns}
              rowClassName={(stock) =>
                /*
                 * Подсветка «ниже порога»: полоса слева + красный остаток.
                 * Мягкой заливки вроде `bg-danger-500/5` здесь нет
                 * сознательно — цвета заданы как `var(--color-…)`, а
                 * Tailwind v3 не умеет применять модификатор прозрачности к
                 * CSS-переменной, и класс молча не сгенерировался бы.
                 */
                stock.belowThreshold ? 'border-l-2 border-l-danger-500' : ''
              }
              empty="Позиций нет"
            />
          </Card>
        ))}
    </div>
  );
}
