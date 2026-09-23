import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, deleteRoute, listFloors, listObjects, listRoutes } from '../../api/core';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  Select,
  errorMessage,
} from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import type { FloorEntity, ObjectEntity, RouteWithPoints } from '../../types/core';
import { ROUTE_STATUS_LABELS, ROUTE_STATUSES, type RouteStatus } from '../../types/status';
import { defaultRouteName, floorLabel } from './helpers';

/**
 * Шаг выбора маршрута `/routes`: каскад «объект → этаж → маршрут».
 *
 * Каскад не «лестница в три шага» в одном столбце, а три панели сразу: экран
 * конструктора открывают, чтобы найти маршрут, и переключение этапа на каждом
 * уровне заставляло бы возвращаться назад.
 */

export interface RouteListPageProps {
  objectId: string | null;
  floorId: string | null;
  onSelectObject: (objectId: string) => void;
  onSelectFloor: (floorId: string) => void;
  onOpenRoute: (routeId: string, floorId: string) => void;
  onCreateRoute: (routeId: string, floorId: string) => void;
  canEdit: boolean;
}

export function RouteListPage({
  objectId,
  floorId,
  onSelectObject,
  onSelectFloor,
  onOpenRoute,
  onCreateRoute,
  canEdit,
}: RouteListPageProps) {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [take, setTake] = useState(50);
  const [statusFilter, setStatusFilter] = useState<RouteStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<RouteWithPoints | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const objectsQuery = useQuery({
    queryKey: ['objects', { skip, take, search: debouncedSearch }],
    queryFn: () => listObjects({ skip, take, search: debouncedSearch || undefined }),
  });

  const floorsQuery = useQuery({
    queryKey: ['floors', objectId],
    queryFn: () => listFloors(objectId as string),
    enabled: objectId !== null,
  });

  const routesQuery = useQuery({
    queryKey: ['routes', floorId],
    queryFn: () => listRoutes(floorId as string),
    enabled: floorId !== null,
  });

  const objects = objectsQuery.data?.items ?? [];
  const floors = useMemo<FloorEntity[]>(() => floorsQuery.data ?? [], [floorsQuery.data]);
  const routes = useMemo<RouteWithPoints[]>(() => routesQuery.data ?? [], [routesQuery.data]);

  const selectedObject = objects.find((item) => item.id === objectId) ?? null;
  const selectedFloor = floors.find((floor) => floor.id === floorId) ?? null;

  const filteredRoutes = useMemo(
    () => (statusFilter === '' ? routes : routes.filter((route) => route.status === statusFilter)),
    [routes, statusFilter],
  );

  const createMutation = useMutation({
    mutationFn: (payload: { floorId: string; name: string }) => createRoute(payload.floorId, payload.name),
    onSuccess: (route) => {
      void queryClient.invalidateQueries({ queryKey: ['routes', route.floorId] });
      setCreateOpen(false);
      setNewName('');
      onCreateRoute(route.id, route.floorId);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoute(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routes', floorId] });
      setRouteToDelete(null);
    },
    onError: (error) => {
      setActionError(errorMessage(error));
      setRouteToDelete(null);
    },
  });

  function openCreate() {
    setNewName(defaultRouteName());
    setNameError(null);
    createMutation.reset();
    setCreateOpen(true);
  }

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed.length < 3 || trimmed.length > 80) {
      setNameError('Название — от 3 до 80 символов');
      return;
    }
    if (floorId === null) return;
    setNameError(null);
    createMutation.mutate({ floorId, name: trimmed });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[22rem_26rem_minmax(0,1fr)]">
      <Card className="flex max-h-[78vh] flex-col gap-5 overflow-y-auto" padded={false}>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500" htmlFor="route-object-search">
              1. Объект
            </label>
            <Input
              id="route-object-search"
              data-testid="object-select"
              value={search}
              placeholder="Поиск объекта"
              onChange={(event) => {
                setSearch(event.target.value);
                setSkip(0);
              }}
            />
          </div>

          {objectsQuery.isError && (
            <ErrorBanner error={objectsQuery.error} onRetry={() => void objectsQuery.refetch()} />
          )}

          <div className="flex flex-col gap-1">
            {objectsQuery.isLoading && <LoadingBlock label="Загрузка объектов…" />}
            {!objectsQuery.isLoading && objects.length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-400">
                Объекты не найдены.
              </div>
            )}
            {objects.map((object) => (
              <ObjectRow
                key={object.id}
                object={object}
                selected={object.id === objectId}
                onSelect={() => {
                  setStatusFilter('');
                  onSelectObject(object.id);
                }}
              />
            ))}
          </div>

          <Pagination
            total={objectsQuery.data?.total ?? 0}
            skip={skip}
            take={take}
            disabled={objectsQuery.isLoading}
            onChange={(next) => {
              setSkip(next.skip);
              setTake(next.take);
            }}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-200 p-4">
          <label className="text-xs font-medium text-neutral-500" htmlFor="route-floor-select">
            2. Этаж
          </label>
          {objectId === null ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-400">
              Сначала выберите объект.
            </div>
          ) : floorsQuery.isError ? (
            <ErrorBanner error={floorsQuery.error} onRetry={() => void floorsQuery.refetch()} />
          ) : floorsQuery.isLoading ? (
            <LoadingBlock label="Загрузка этажей…" />
          ) : floors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-400">
              У объекта нет этажей.
            </div>
          ) : (
            <Select
              id="route-floor-select"
              data-testid="floor-select"
              value={floorId ?? ''}
              onChange={(event) => {
                setStatusFilter('');
                onSelectFloor(event.target.value);
              }}
            >
              <option value="">— выберите этаж —</option>
              {floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floorLabel(floor)}
                </option>
              ))}
            </Select>
          )}

          {selectedObject && (
            <div className="text-xs text-neutral-400">
              {selectedObject.address}
              {selectedFloor && ` · ${selectedFloor.name}`}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex max-h-[78vh] min-h-0 flex-col" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="text-xs font-medium text-neutral-500">
            3. Маршруты этажа
            <span className="ml-2 font-mono text-neutral-700">{routes.length}</span>
          </h2>
          <div className="flex items-center gap-2 max-md:w-full">
            {/* На телефоне «фильтр + создать» — одна строка: селект тянется,
                кнопка не сжимается ниже тач-таргета. */}
            <Select
              aria-label="Фильтр по статусу"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as RouteStatus | '')}
              className="w-40 py-1 text-xs max-md:flex-1"
              disabled={floorId === null}
            >
              <option value="">Все статусы</option>
              {ROUTE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ROUTE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              size="sm"
              data-testid="route-create-button"
              className="max-md:shrink-0 max-md:whitespace-nowrap"
              onClick={openCreate}
              disabled={floorId === null || !canEdit}
              title={floorId === null ? 'Сначала выберите этаж' : undefined}
            >
              + Новый маршрут
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {floorId === null ? (
            <div className="p-4">
              <EmptyState
                title="Выберите объект и этаж"
                hint="Маршруты собираются в границах одного этажа: точка маршрута может ссылаться только на помещение своего этажа."
              />
            </div>
          ) : routesQuery.isError ? (
            <div className="p-4">
              <ErrorBanner error={routesQuery.error} onRetry={() => void routesQuery.refetch()} />
            </div>
          ) : routesQuery.isLoading ? (
            <div className="p-4">
              <LoadingBlock label="Загрузка маршрутов…" />
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={routes.length === 0 ? 'На этаже нет маршрутов' : 'Нет маршрутов с таким статусом'}
                hint={
                  routes.length === 0
                    ? 'Создайте черновик маршрута и добавьте в него помещения этажа.'
                    : 'Сбросьте фильтр по статусу.'
                }
                action={
                  routes.length === 0 && canEdit ? (
                    <Button variant="ghost" size="sm" onClick={openCreate}>
                      Создать
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            /*
              Два представления одного списка. На планшете и desktop (≥768) —
              ПРЕЖНИЙ список `<ul>`: критерий приёмки требует визуальной
              идентичности ≥1024, поэтому разметка, классы и роли строки здесь
              дословно те же, что были до адаптива. На телефоне (<768) —
              карточки руками: `ResponsiveTable` для этого не годится, он по
              построению рисует `<table>` на `md+`, а таблица здесь запрещена.
              Состав данных карточки совпадает со строкой списка.
            */
            <>
              <ul className="hidden flex-col md:flex">
                {filteredRoutes.map((route) => (
                  <li key={route.id} className="border-b border-neutral-200 last:border-b-0">
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-neutral-50">
                      <button
                        type="button"
                        data-testid="route-select"
                        data-route-id={route.id}
                        onClick={() => onOpenRoute(route.id, route.floorId)}
                        className="min-w-0 flex-1 text-left max-lg:min-h-[44px]"
                      >
                        <div className="truncate text-sm font-medium text-neutral-900">
                          {route.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <RouteStatusPill status={route.status} />
                          <span className="font-mono text-xs text-neutral-500">
                            {route.points.length} точек ·{' '}
                            {route.points.reduce(
                              (sum, point) => sum + (point.estimatedTimeMin ?? 0),
                              0,
                            )}{' '}
                            мин
                          </span>
                        </div>
                      </button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Удалить маршрут ${route.name}`}
                          disabled={deleteMutation.isPending}
                          onClick={() => setRouteToDelete(route)}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 p-3 md:hidden">
                {filteredRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isAdmin={isAdmin}
                    deleting={deleteMutation.isPending}
                    onOpen={() => onOpenRoute(route.id, route.floorId)}
                    onDelete={() => setRouteToDelete(route)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {actionError !== null && (
          <div className="border-t border-neutral-200 p-4">
            <div className="rounded-lg border border-danger-500 bg-white px-3 py-2 text-xs text-danger-600">
              {actionError}
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setActionError(null)}>
                Скрыть
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="hidden max-h-[78vh] min-h-0 overflow-y-auto xl:flex xl:flex-col">
        {selectedFloor === null ? (
          <EmptyState
            title="Выберите маршрут"
            hint="Откройте маршрут из списка, чтобы собрать порядок обхода на плане этажа."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs text-neutral-500">Выбранный этаж</div>
              <div className="text-lg font-medium text-neutral-900">{floorLabel(selectedFloor)}</div>
            </div>
            <div className="text-sm text-neutral-500">
              Маршрутов на этаже: <span className="font-mono">{routes.length}</span>
            </div>
            <div className="text-sm text-neutral-500">
              Точек во всех маршрутах:{' '}
              <span className="font-mono">
                {routes.reduce((sum, route) => sum + route.points.length, 0)}
              </span>
            </div>
            {selectedFloor.planImageUrl === null && (
              <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-400">
                План этажа не загружен — маркеры точек на плане будут недоступны.
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Новый маршрут"
        onClose={() => setCreateOpen(false)}
        busy={createMutation.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Отмена
            </Button>
            <Button
              variant="primary"
              data-testid="route-submit"
              onClick={submitCreate}
              loading={createMutation.isPending}
              disabled={floorId === null}
            >
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4" data-testid="route-form">
          {createMutation.isError && <ErrorBanner error={createMutation.error} />}
          <Field label="Этаж" htmlFor="create-route-floor">
            <Input
              id="create-route-floor"
              value={selectedFloor ? floorLabel(selectedFloor) : ''}
              readOnly
              disabled
            />
          </Field>
          <Field
            label="Название"
            htmlFor="create-route-name"
            required
            error={nameError}
            hint="3–80 символов"
          >
            <Input
              id="create-route-name"
              data-testid="route-name-input"
              value={newName}
              invalid={nameError !== null}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <div className="text-xs text-neutral-500">
            Новый маршрут создаётся в статусе <Badge tone="warning">Черновик</Badge> — активировать его
            можно после сборки точек.
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={routeToDelete !== null}
        title="Удаление маршрута"
        message={
          routeToDelete
            ? `Маршрут «${routeToDelete.name}» и его ${routeToDelete.points.length} точек будут удалены безвозвратно.`
            : ''
        }
        confirmLabel="Удалить"
        busy={deleteMutation.isPending}
        onCancel={() => setRouteToDelete(null)}
        onConfirm={() => {
          if (routeToDelete) deleteMutation.mutate(routeToDelete.id);
        }}
      />
    </div>
  );
}

/**
 * Карточка маршрута — только для телефона (<768). Локальный компонент, а не
 * `ResponsiveTable`: тот рисует `<table>` на `md+`, а на планшете и desktop по
 * критерию приёмки обязан остаться прежний список `<ul>`.
 * Тестовые хуки (`route-select`, `data-route-id`) и состав данных — как у строки
 * списка: имя, статус, число точек и время, удаление для ADMIN.
 */
function RouteCard({
  route,
  isAdmin,
  deleting,
  onOpen,
  onDelete,
}: {
  route: RouteWithPoints;
  isAdmin: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const minutes = route.points.reduce((sum, point) => sum + (point.estimatedTimeMin ?? 0), 0);
  return (
    <div
      data-testid="route-select"
      data-route-id={route.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 shadow-sm active:bg-neutral-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium text-neutral-900">{route.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RouteStatusPill status={route.status} />
          </div>
        </div>
        {isAdmin && (
          // Клик по действию не должен уводить в конструктор маршрута.
          <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Удалить маршрут ${route.name}`}
              disabled={deleting}
              onClick={onDelete}
            >
              ✕
            </Button>
          </span>
        )}
      </div>

      <dl className="mt-3 flex items-baseline justify-between gap-3">
        <dt className="shrink-0 text-xs text-neutral-500">Точек / время</dt>
        <dd className="min-w-0 break-words text-right font-mono text-xs text-neutral-800">
          {route.points.length} · {minutes} мин
        </dd>
      </dl>
    </div>
  );
}

function ObjectRow({
  object,
  selected,
  onSelect,
}: {
  object: ObjectEntity;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'rounded-md border-l-2 px-3 py-2 text-left transition-colors',
        selected
          ? 'border-primary-600 bg-primary-50'
          : 'border-transparent hover:bg-neutral-50',
      ].join(' ')}
    >
      <div className="truncate text-sm font-medium text-neutral-900">{object.name}</div>
      <div className="truncate text-xs text-neutral-500">
        {object.address} · этажей: <span className="font-mono">{object.floorsCount}</span>
      </div>
    </button>
  );
}

/** Пилюля статуса списка: те же подписи, что и у бейджа, но без иконки-точки. */
function RouteStatusPill({ status }: { status: RouteStatus }) {
  const tone = status === 'ACTIVE' ? 'text-success-600' : status === 'ARCHIVED' ? 'text-neutral-500' : 'text-warning-600';
  const dot = status === 'ACTIVE' ? 'bg-success-500' : status === 'ARCHIVED' ? 'bg-neutral-400' : 'bg-warning-500';
  return (
    <span className={['inline-flex items-center gap-1 text-xs', tone].join(' ')}>
      <span className={['h-1.5 w-1.5 rounded-full', dot].join(' ')} aria-hidden="true" />
      {status === 'ACTIVE' ? 'Активен' : status === 'ARCHIVED' ? 'В архиве' : 'Черновик'}
    </span>
  );
}

/** Помещения объекта и маршруты этажа — ссылки для перехода в конструктор. */
export function routeListHref(routeId: string, floorId: string): string {
  return `${ROUTES.route(routeId)}?floorId=${encodeURIComponent(floorId)}`;
}
