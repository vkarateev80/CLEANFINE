import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Select,
  SoftWarning,
  Table,
  TableMessageRow,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components/ui';
import { useCanMoveMaterials } from '../../hooks/usePermissions';
import { StockLevelBadge, apiStatus, formatMoney, formatQuantity, shortId, useParamWriter } from './materialsHelpers';
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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Объект
          <Select
            data-testid="stocks-object-filter"
            aria-label="Объект остатков"
            className="w-72"
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

        <span className="ml-auto font-mono text-xs text-neutral-500">
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
            <Table>
              <THead>
                <Th className="min-w-[220px]">Материал</Th>
                {objectId === '' && <Th className="w-[200px]">Объект</Th>}
                <Th className="w-[130px]" align="right">
                  Остаток
                </Th>
                <Th className="w-[110px]" align="right">
                  Порог
                </Th>
                <Th className="w-[150px]">Статус</Th>
                <Th className="w-[130px]" align="right">
                  Цена, ₽
                </Th>
                <Th className="w-[140px]" align="right">
                  Стоимость, ₽
                </Th>
                {canMove && <Th className="w-[120px]" align="right">Действия</Th>}
              </THead>
              <TBody>
                {items.map((stock) => (
                  <Tr
                    key={`${stock.materialId}-${stock.objectId}`}
                    /*
                     * Идентификатор строки — пара «материал + объект», а не один
                     * материал: в режиме «Все объекты» один и тот же материал
                     * встречается столько раз, сколько объектов держат остаток.
                     * Поэтому e2e перед обращением к `stock-quantity-<materialId>`
                     * обязан выбрать объект в `stocks-object-filter` — иначе
                     * селектор неоднозначен.
                     */
                    testId={`stock-row-${stock.materialId}`}
                    /*
                     * Подсветка «ниже порога»: полоса слева + красный остаток.
                     * Мягкой заливки вроде `bg-danger-500/5` здесь нет
                     * сознательно — цвета заданы как `var(--color-…)`, а
                     * Tailwind v3 не умеет применять модификатор прозрачности к
                     * CSS-переменной, и класс молча не сгенерировался бы.
                     */
                    className={stock.belowThreshold ? 'border-l-2 border-l-danger-500' : ''}
                  >
                    <Td>
                      <span
                        className={
                          stock.belowThreshold ? 'block text-danger-600' : 'block text-neutral-900'
                        }
                      >
                        {stock.material.name}
                      </span>
                      <span className="font-mono text-xs text-neutral-400">
                        {stock.material.unit}
                      </span>
                    </Td>
                    {objectId === '' && <Td>{objectLabel(stock.objectId)}</Td>}
                    <Td mono align="right">
                      <span
                        data-testid={`stock-quantity-${stock.materialId}`}
                        className={stock.belowThreshold ? 'text-danger-600' : ''}
                      >
                        {formatQuantity(stock.quantity)}
                      </span>
                    </Td>
                    <Td mono align="right">
                      {formatQuantity(stock.minStockThreshold)}
                    </Td>
                    <Td>
                      <StockLevelBadge belowThreshold={stock.belowThreshold} />
                    </Td>
                    <Td mono align="right">
                      {formatMoney(stock.material.costPerUnit)}
                    </Td>
                    <Td mono align="right">
                      {formatMoney(stock.quantity * stock.material.costPerUnit)}
                    </Td>
                    {canMove && (
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`stock-move-${stock.materialId}`}
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
                      </Td>
                    )}
                  </Tr>
                ))}

                {items.length === 0 && (
                  <TableMessageRow colSpan={canMove ? 8 : 7}>Позиций нет</TableMessageRow>
                )}
              </TBody>
            </Table>
          </Card>
        ))}
    </div>
  );
}
