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
import {
  MovementTypeBadge,
  apiStatus,
  formatDateTime,
  formatQuantity,
  movementAuthor,
  shortId,
  useParamWriter,
} from './materialsHelpers';
import type { MaterialMovementEntity } from '../../types/materials';
import { useMaterialsList, useMovementHistory, useObjectOptions } from './useMaterials';

/**
 * Вкладка «История»: движения одного материала с фильтрами по объекту и периоду.
 *
 * Контракт `GET /api/materials/:id/movements` требует id материала и не имеет
 * `skip`: есть только `limit` (≤ 500) и `total` — общее число подходящих
 * записей. Поэтому «пагинация» здесь честно устроена как увеличение лимита
 * («Показать ещё»), а не как выдуманные страницы, которых сервис не умеет.
 *
 * Период передаётся датами `YYYY-MM-DD`: верхнюю границу бэкенд трактует как
 * конец суток (`endOfDayIfMidnight`), поэтому последний день периода попадает в
 * выдачу целиком.
 */

/** Ступени лимита: 500 — максимум, который принимает `MovementsQueryDto`. */
const LIMITS = [25, 50, 100, 200, 500] as const;
const DEFAULT_LIMIT = 50;

export function MovementsPanel() {
  const [params] = useSearchParams();
  const write = useParamWriter();

  const materialId = params.get('mvMaterialId') ?? '';
  const objectId = params.get('mvObjectId') ?? '';
  const from = params.get('mvFrom') ?? '';
  const to = params.get('mvTo') ?? '';
  const limit = Number(params.get('mvLimit') ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT;

  const objects = useObjectOptions();
  const materials = useMaterialsList({ skip: 0, take: 100 });

  const query = useMovementHistory(materialId === '' ? null : materialId, {
    ...(objectId === '' ? {} : { objectId }),
    ...(from === '' ? {} : { from }),
    ...(to === '' ? {} : { to }),
    limit,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const material = (materials.data?.items ?? []).find((item) => item.id === materialId);
  const objectNames = new Map(
    (objects.data?.items ?? []).map((object) => [object.id, object.name]),
  );

  const forbidden = apiStatus(query.error) === 403;
  const filtersActive = objectId !== '' || from !== '' || to !== '';

  function objectLabel(id: string): string {
    return objectNames.get(id) ?? shortId(id);
  }

  /**
   * Колонки истории движений: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона (сущность — объект, статус — тип движения).
   *
   * `rowTestId` не передан: id строки нужен существующему e2e РОВНО один
   * (`toHaveCount(3)` по `[data-testid^="movement-row-"]`), а примитив рендерит
   * таблицу и карточки в DOM одновременно — дубль сломал бы подсчёт. Поэтому хук
   * строки остаётся в табличной ячейке, а карточка получает `data-testid="card"`.
   */
  const movementColumns: ResponsiveColumn<MaterialMovementEntity>[] = [
    {
      key: 'createdAt',
      header: 'Дата',
      thClassName: 'w-[150px]',
      mono: true,
      card: 'field',
      cardLabel: 'Дата',
      cell: (movement) => (
        <TableOnlyTestId id={`movement-row-${movement.id}`}>
          {formatDateTime(movement.createdAt)}
        </TableOnlyTestId>
      ),
    },
    {
      key: 'type',
      header: 'Тип',
      thClassName: 'w-[150px]',
      card: 'badge',
      cell: (movement) => <MovementTypeBadge type={movement.type} />,
    },
    {
      key: 'quantity',
      header: 'Количество',
      thClassName: 'w-[130px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Количество',
      cell: (movement) =>
        `${formatQuantity(movement.quantity)}${material ? ` ${material.unit}` : ''}`,
    },
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[200px]',
      card: 'title',
      cell: (movement) => (
        <>
          <span className="block text-neutral-800">{objectLabel(movement.objectId)}</span>
          {movement.targetObjectId && (
            <span className="block text-xs font-normal text-neutral-500">
              → {objectLabel(movement.targetObjectId)}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'ticket',
      header: 'Заявка',
      thClassName: 'w-[140px]',
      card: 'field',
      cardLabel: 'Заявка',
      cell: (movement) =>
        movement.ticketId ? (
          <span className="font-mono text-xs">{shortId(movement.ticketId)}</span>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
    {
      key: 'author',
      header: 'Автор',
      thClassName: 'w-[150px]',
      card: 'field',
      cardLabel: 'Автор',
      cell: (movement) => (
        <span className="font-mono text-xs">{movementAuthor(movement.userId)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/*
        На телефоне фильтры встают в одну колонку во всю ширину: `w-72`/`w-64`/`w-40`
        рядом не помещаются в 360 px. `max-md:[&>*]:w-full` растягивает прямых детей
        карточки (обёртки `Field`), а контролы внутри `Field` уже `w-full` — так
        ширина полей не фиксирована и на планшете с desktop вид прежний.
      */}
      <Card className="flex flex-wrap items-end gap-4 max-md:[&>*]:w-full">
        <Field label="Материал" htmlFor="movements-material" required>
          <Select
            id="movements-material"
            data-testid="movements-material-filter"
            className="w-72"
            value={materialId}
            disabled={materials.isLoading}
            onChange={(event) => write({ mvMaterialId: event.target.value || null })}
          >
            <option value="">{materials.isLoading ? 'Загрузка…' : 'Выберите материал'}</option>
            {(materials.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Объект" htmlFor="movements-object">
          <Select
            id="movements-object"
            data-testid="movements-object-filter"
            className="w-64"
            value={objectId}
            disabled={objects.isLoading}
            onChange={(event) => write({ mvObjectId: event.target.value || null })}
          >
            <option value="">Все объекты</option>
            {(objects.data?.items ?? []).map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="С" htmlFor="movements-from">
          <Input
            id="movements-from"
            data-testid="movements-from"
            type="date"
            className="w-40"
            value={from}
            onChange={(event) => write({ mvFrom: event.target.value || null })}
          />
        </Field>

        <Field label="По" htmlFor="movements-to">
          <Input
            id="movements-to"
            data-testid="movements-to"
            type="date"
            className="w-40"
            value={to}
            onChange={(event) => write({ mvTo: event.target.value || null })}
          />
        </Field>

        <Field label="Лимит" htmlFor="movements-limit">
          <Select
            id="movements-limit"
            data-testid="movements-limit"
            className="w-28"
            value={limit}
            onChange={(event) => write({ mvLimit: event.target.value })}
          >
            {LIMITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => write({ mvObjectId: null, mvFrom: null, mvTo: null })}
          >
            Сбросить фильтры
          </Button>
        )}
      </Card>

      {query.isError && (
        <ErrorBanner
          error={forbidden ? new Error('Недостаточно прав для просмотра истории') : query.error}
          onRetry={() => void query.refetch()}
        />
      )}

      {!query.isError && query.isRefetchError && (
        <SoftWarning>История может быть неактуальна — обновите страницу.</SoftWarning>
      )}

      {materialId === '' ? (
        <EmptyState
          title="Выберите материал"
          hint="История движений ведётся по каждому материалу отдельно: укажите материал, при необходимости — объект и период"
        />
      ) : query.isLoading ? (
        <LoadingBlock label="Читаем историю движений…" />
      ) : !query.isError && items.length === 0 ? (
        <EmptyState
          title="Движений нет"
          hint={
            filtersActive
              ? 'За выбранный период и объект записей нет — измените фильтры'
              : 'По этому материалу ещё не было прихода, расхода, перемещения или списания'
          }
        />
      ) : (
        !query.isError && (
          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-neutral-500">
              <span className="font-mono">
                показано {items.length} из {total}
                {material ? ` · ${material.name}` : ''}
              </span>
              {total > items.length && limit < 500 && (
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="movements-show-more"
                  disabled={query.isFetching}
                  onClick={() => {
                    const next = LIMITS.find((value) => value > limit) ?? 500;
                    write({ mvLimit: String(next) });
                  }}
                >
                  Показать ещё
                </Button>
              )}
            </div>

            <ResponsiveTable<MaterialMovementEntity>
              items={items}
              getKey={(movement) => movement.id}
              columns={movementColumns}
              rowClassName={() => (query.isFetching ? 'opacity-60' : '')}
              empty="Движений на этой странице нет"
            />
          </Card>
        )
      )}
    </div>
  );
}
