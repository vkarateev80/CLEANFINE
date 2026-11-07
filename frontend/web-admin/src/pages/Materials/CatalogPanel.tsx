import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { deleteMaterial } from '../../api/materials';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  Pagination,
  ResponsiveTable,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { useUrlSearchInput } from '../../hooks/useUrlSearchInput';
import { useCanManageMaterials, useCanMoveMaterials } from '../../hooks/usePermissions';
import type { MaterialEntity, MaterialListItem } from '../../types/materials';
import { MaterialFormModal } from './MaterialFormModal';
import { apiStatus, formatMoney, formatQuantity, useParamWriter } from './materialsHelpers';
import type { MovementPreset } from './MovementModal';
import { useMaterialsList } from './useMaterials';

/**
 * Вкладка «Справочник»: таблица материалов с серверным поиском, сортировкой
 * в пределах загруженной страницы и модалками создания/правки/удаления.
 *
 * Сортировка на клиенте: material-service отдаёт список фиксированным порядком
 * `name asc` и параметров `sort`/`order` в API нет (то же решение, что в списке
 * объектов). Поиск, наоборот, серверный — `ListMaterialsQueryDto.search` ищет по
 * названию И поставщику, и клиентская фильтрация страницы дала бы неполную выдачу.
 *
 * Права: правка справочника — ADMIN/SUPERVISOR (`@Roles` в контроллере),
 * движения — ещё и OPERATOR. Оператору кнопки правки не показываются, но данные
 * он видит: чтение открыто всем авторизованным.
 */

type SortKey = 'name' | 'costPerUnit' | 'minStockThreshold' | 'defaultConsumption';
type SortOrder = 'asc' | 'desc';

const TAKE = 25;

export function CatalogPanel({ onMove }: { onMove: (preset: MovementPreset) => void }) {
  const [params] = useSearchParams();
  const write = useParamWriter();
  const canManage = useCanManageMaterials();
  const canMove = useCanMoveMaterials();

  const skip = Number(params.get('catSkip') ?? '0') || 0;
  const take = Number(params.get('catTake') ?? String(TAKE)) || TAKE;
  const search = params.get('catSearch') ?? '';

  // Поле поиска ↔ `?catSearch=` (см. useUrlSearchInput: прежние два эффекта
  // зацикливались и стирали набранный текст).
  const [searchInput, setSearchInput] = useUrlSearchInput(search, (value) =>
    write({ catSearch: value === '' ? null : value, catSkip: null }),
  );
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({
    key: 'name',
    order: 'asc',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialEntity | null>(null);
  const [deleting, setDeleting] = useState<MaterialListItem | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const queryClient = useQueryClient();

  const query = useMaterialsList({
    skip,
    take,
    ...(search === '' ? {} : { search }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => setDeleteError(error),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const filtersActive = search !== '';

  const sorted = useMemo(() => {
    const direction = sort.order === 'asc' ? 1 : -1;
    return [...items].sort((left, right) => {
      if (sort.key === 'name') return left.name.localeCompare(right.name, 'ru') * direction;
      return (left[sort.key] - right[sort.key]) * direction;
    });
  }, [items, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'asc' },
    );
  }

  function sortMark(key: SortKey): string {
    if (sort.key !== key) return '';
    return sort.order === 'asc' ? ' ▲' : ' ▼';
  }

  const forbidden = apiStatus(query.error) === 403;
  const showSkeleton = query.isLoading;

  /**
   * Колонки описываются ОДИН раз: `cell` — ячейка таблицы (md+, как раньше),
   * `card` — роль в карточке телефона (<768, см. ADR-002).
   *
   * `rowTestId` сознательно не передан: примитив рендерит оба представления в DOM
   * (переключение — CSS), и один id строки оказался бы в DOM дважды, а e2e-набор
   * считает строки поиска строго (`toHaveCount(1)` по `[data-testid^="material-row-"]`).
   * Поэтому прежние хуки строк и кнопок остаются в таблице (`TableOnlyTestId`),
   * а карточка получает канонический `data-testid="card"` от примитива.
   */
  const columns: ResponsiveColumn<MaterialListItem>[] = [
    {
      key: 'name',
      header: (
        <button
          type="button"
          // Сортировка в шапке таблицы: на телефоне и планшете таргет ≥44 px
          // (на 360 px сортировки нет — таблица заменена карточками).
          className="max-lg:min-h-[44px]"
          data-testid="materials-sort-name"
          onClick={() => toggleSort('name')}
        >
          Название{sortMark('name')}
        </button>
      ),
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (material) => (
        <>
          <TableOnlyTestId id={`material-row-${material.id}`}>
            <span className="block text-neutral-900">{material.name}</span>
          </TableOnlyTestId>
          {/*
            Счётчики складов и движений остаются во второй строке той же ячейки:
            отдельной колонкой они дали бы лишний столбец в таблице desktop.
            `font-normal` — чтобы в карточке (там заголовок набран medium) вторая
            строка не выглядела частью названия; на desktop вес не меняется.
          */}
          <span className="block font-mono text-xs font-normal text-neutral-400">
            {material._count.stocks} склад. · {material._count.movements} движ.
          </span>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Единица',
      thClassName: 'w-[110px]',
      card: 'field',
      cardLabel: 'Единица',
      cell: (material) => material.unit,
    },
    {
      key: 'consumption',
      header: (
        <button
          type="button"
          // Сортировка в шапке таблицы: на телефоне и планшете таргет ≥44 px
          // (на 360 px сортировки нет — таблица заменена карточками).
          className="max-lg:min-h-[44px]"
          data-testid="materials-sort-consumption"
          onClick={() => toggleSort('defaultConsumption')}
        >
          Норма расхода{sortMark('defaultConsumption')}
        </button>
      ),
      thClassName: 'w-[150px]',
      card: 'field',
      cardLabel: 'Норма расхода',
      mono: true,
      cell: (material) => formatQuantity(material.defaultConsumption),
    },
    {
      key: 'threshold',
      header: (
        <button
          type="button"
          // Сортировка в шапке таблицы: на телефоне и планшете таргет ≥44 px
          // (на 360 px сортировки нет — таблица заменена карточками).
          className="max-lg:min-h-[44px]"
          data-testid="materials-sort-threshold"
          onClick={() => toggleSort('minStockThreshold')}
        >
          Порог{sortMark('minStockThreshold')}
        </button>
      ),
      thClassName: 'w-[130px]',
      card: 'field',
      cardLabel: 'Порог',
      mono: true,
      cell: (material) => formatQuantity(material.minStockThreshold),
    },
    {
      key: 'cost',
      header: (
        <button
          type="button"
          // Сортировка в шапке таблицы: на телефоне и планшете таргет ≥44 px
          // (на 360 px сортировки нет — таблица заменена карточками).
          className="max-lg:min-h-[44px]"
          data-testid="materials-sort-cost"
          onClick={() => toggleSort('costPerUnit')}
        >
          Цена, ₽{sortMark('costPerUnit')}
        </button>
      ),
      thClassName: 'w-[140px]',
      align: 'right',
      card: 'field',
      cardLabel: 'Цена, ₽',
      mono: true,
      cell: (material) => formatMoney(material.costPerUnit),
    },
    {
      key: 'supplier',
      header: 'Поставщик',
      thClassName: 'min-w-[180px]',
      card: 'field',
      cardLabel: 'Поставщик',
      cell: (material) => material.supplier ?? <span className="text-neutral-400">—</span>,
    },
    {
      key: 'actions',
      header: 'Действия',
      thClassName: 'w-[190px]',
      align: 'right',
      card: 'actions',
      cell: (material) => (
        <div className="flex justify-end gap-2">
          {canMove && (
            <TableOnlyTestId id={`material-move-${material.id}`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMove({ materialId: material.id, type: 'IN' })}
              >
                Движение
              </Button>
            </TableOnlyTestId>
          )}
          {canManage && (
            <>
              <TableOnlyTestId id={`material-edit-${material.id}`}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(material);
                    setFormOpen(true);
                  }}
                >
                  Изменить
                </Button>
              </TableOnlyTestId>
              <TableOnlyTestId id={`material-delete-${material.id}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(material);
                  }}
                >
                  Удалить
                </Button>
              </TableOnlyTestId>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="materials-search"
          aria-label="Поиск по материалам"
          // На телефоне поле поиска занимает всю ширину строки: `w-72` (288 px)
          // рядом с кнопкой не помещается в 360 px и распирал бы карточку.
          className="w-72 max-md:w-full"
          placeholder="Поиск по названию и поставщику"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              write({ catSearch: null, catSkip: null });
            }}
          >
            Сбросить поиск
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3 max-md:ml-0 max-md:w-full">
          {canManage && (
            <Button
              variant="primary"
              data-testid="material-create-button"
              // Тач-таргет основной кнопки экрана: у `size="md"` высота ~40 px,
              // на телефоне и планшете доводим до 44 px (на desktop не действует).
              className="max-lg:min-h-[44px] max-md:w-full"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Добавить материал
            </Button>
          )}
        </div>
      </Card>

      {query.isError && (
        <ErrorBanner
          error={forbidden ? new Error('Недостаточно прав для просмотра материалов') : query.error}
          onRetry={() => void query.refetch()}
        />
      )}

      {deleteError ? (
        <ErrorBanner error={deleteError} onRetry={() => setDeleteError(null)} />
      ) : null}

      {!query.isError && query.isRefetchError && (
        <SoftWarning>Справочник может быть неактуален — обновите страницу.</SoftWarning>
      )}

      {!query.isError &&
        (total === 0 && !showSkeleton ? (
          filtersActive ? (
            <EmptyState
              title="Ничего не найдено"
              hint="Попробуйте другое название или поставщика"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    write({ catSearch: null, catSkip: null });
                  }}
                >
                  Сбросить поиск
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Справочник пуст"
              hint="Добавьте первый материал: название, единицу измерения, норму расхода и порог"
              action={
                canManage ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    Добавить материал
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <Card padded={false}>
            {/*
              Справочник: таблица на планшете и desktop, карточки на телефоне.
              Сортировка, поиск и пагинация остаются на экране — примитив берёт
              только переключатель представлений (ADR-002).
            */}
            <ResponsiveTable<MaterialListItem>
              items={sorted}
              getKey={(material) => material.id}
              columns={columns}
              loading={showSkeleton}
              rowClassName={() => (query.isFetching && !showSkeleton ? 'opacity-60' : '')}
              empty="Материалов на этой странице нет"
            />

            <Pagination
              total={total}
              skip={skip}
              take={take}
              disabled={query.isFetching}
              onChange={({ skip: nextSkip, take: nextTake }) =>
                write({ catSkip: String(nextSkip), catTake: String(nextTake) })
              }
            />
          </Card>
        ))}

      {formOpen && (
        <MaterialFormModal
          open
          material={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить материал?"
        message={
          <>
            Материал «{deleting?.name}» будет удалён вместе с остатками и историей движений.
            Действие необратимо.
          </>
        }
        busy={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
