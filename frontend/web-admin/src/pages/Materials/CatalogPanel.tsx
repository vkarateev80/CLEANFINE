import { useEffect, useMemo, useState } from 'react';
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
  SoftWarning,
  Table,
  TableMessageRow,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
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

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({ key: 'name', order: 'asc' });
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

  // Обратная навигация браузера меняет query-строку, а поле поиска — локальное
  // состояние: без синхронизации в контроле остался бы прежний запрос.
  useEffect(() => {
    if (search !== debouncedSearch) setSearchInput(search);
  }, [search, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === search) return;
    write({ catSearch: debouncedSearch === '' ? null : debouncedSearch, catSkip: null });
    // write читает актуальные параметры через функциональную форму setParams,
    // поэтому в зависимостях достаточно отложенного значения поиска.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="materials-search"
          aria-label="Поиск по материалам"
          className="w-72"
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
        <div className="ml-auto flex items-center gap-3">
          {canManage && (
            <Button
              variant="primary"
              data-testid="material-create-button"
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
            <Table>
              <THead>
                <Th className="min-w-[220px]">
                  <button type="button" data-testid="materials-sort-name" onClick={() => toggleSort('name')}>
                    Название{sortMark('name')}
                  </button>
                </Th>
                <Th className="w-[110px]">Единица</Th>
                <Th className="w-[150px]">
                  <button
                    type="button"
                    data-testid="materials-sort-consumption"
                    onClick={() => toggleSort('defaultConsumption')}
                  >
                    Норма расхода{sortMark('defaultConsumption')}
                  </button>
                </Th>
                <Th className="w-[130px]">
                  <button
                    type="button"
                    data-testid="materials-sort-threshold"
                    onClick={() => toggleSort('minStockThreshold')}
                  >
                    Порог{sortMark('minStockThreshold')}
                  </button>
                </Th>
                <Th className="w-[140px]">
                  <button
                    type="button"
                    data-testid="materials-sort-cost"
                    onClick={() => toggleSort('costPerUnit')}
                  >
                    Цена, ₽{sortMark('costPerUnit')}
                  </button>
                </Th>
                <Th className="min-w-[180px]">Поставщик</Th>
                <Th className="w-[190px]" align="right">
                  Действия
                </Th>
              </THead>
              <TBody>
                {showSkeleton
                  ? Array.from({ length: 5 }).map((_, row) => (
                      <Tr key={row}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <Td key={cell}>
                            <span className="block h-4 w-full animate-pulse rounded-md bg-neutral-200" />
                          </Td>
                        ))}
                      </Tr>
                    ))
                  : sorted.map((material) => (
                      <Tr
                        key={material.id}
                        testId={`material-row-${material.id}`}
                        className={query.isFetching && !showSkeleton ? 'opacity-60' : ''}
                      >
                        <Td>
                          <span className="block text-neutral-900">{material.name}</span>
                          <span className="font-mono text-xs text-neutral-400">
                            {material._count.stocks} склад. · {material._count.movements} движ.
                          </span>
                        </Td>
                        <Td>{material.unit}</Td>
                        <Td mono>{formatQuantity(material.defaultConsumption)}</Td>
                        <Td mono>{formatQuantity(material.minStockThreshold)}</Td>
                        <Td mono align="right">
                          {formatMoney(material.costPerUnit)}
                        </Td>
                        <Td>
                          {material.supplier ?? <span className="text-neutral-400">—</span>}
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-2">
                            {canMove && (
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`material-move-${material.id}`}
                                onClick={() => onMove({ materialId: material.id, type: 'IN' })}
                              >
                                Движение
                              </Button>
                            )}
                            {canManage && (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  data-testid={`material-edit-${material.id}`}
                                  onClick={() => {
                                    setEditing(material);
                                    setFormOpen(true);
                                  }}
                                >
                                  Изменить
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`material-delete-${material.id}`}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleting(material);
                                  }}
                                >
                                  Удалить
                                </Button>
                              </>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))}

                {!showSkeleton && sorted.length === 0 && (
                  <TableMessageRow colSpan={7}>Материалов на этой странице нет</TableMessageRow>
                )}
              </TBody>
            </Table>

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
