import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRoutePoint,
  deleteRoute,
  deleteRoutePoint,
  getRoute,
  listFloors,
  listObjects,
  listRooms,
  listRoutes,
  reorderRoutePoints,
  updateRoute,
  updateRoutePoint,
} from '../../api/core';
import {
  Button,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Modal,
  RouteStatusBadge,
  errorMessage,
} from '../../components/ui';
import { ROUTES } from '../../router/routes';
import type { RoomEntity, RoutePointWithRoom } from '../../types/core';
import {
  ROUTE_ALLOWED_TRANSITIONS,
  canTransitionRoute,
  type RouteStatus,
} from '../../types/status';
import { AddPointModal } from './AddPointModal';
import { FloorPlanPanel } from './FloorPlanPanel';
import { RoutePointsPanel, type RoutePointDraft } from './RoutePointsPanel';
import { floorShortName, inputToTime, sumDraftTime, timeToInput } from './helpers';

/**
 * Редактор маршрута `/routes/:id`: слева — точки с drag-and-drop, справа — план
 * этажа с нумерованными маркерами.
 *
 * Порядок точек правится локально (черновик) и уходит на сервер одним вызовом
 * `reorder` с ПОЛНЫМ списком id: бэкенд отвергает неполный список, а
 * `@@unique([routeId, orderIndex])` делает частые точечные перестановки
 * бессмысленно дорогими. Время точек сохраняется тем же нажатием «Сохранить»,
 * но отдельными `updateRoutePoint` — `reorder` время не принимает.
 */

export interface RouteEditorProps {
  routeId: string;
  /** `objectId` из URL — может отсутствовать при переходе по прямой ссылке. */
  objectId: string | null;
  /** `floorId` из URL; если пуст, берётся из `RouteDetail`. */
  floorId: string | null;
  canEdit: boolean;
  isAdmin: boolean;
}

interface DraftEntry {
  point: RoutePointWithRoom;
  time: string;
}

const STATUS_ACTION_LABELS: Record<RouteStatus, string> = {
  DRAFT: 'Вернуть в черновик',
  ACTIVE: 'Активировать',
  ARCHIVED: 'Архивировать',
};

export function RouteEditor({ routeId, objectId, floorId, canEdit, isAdmin }: RouteEditorProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [scope, setScope] = useState<{ objectId: string | null; floorId: string | null }>({
    objectId,
    floorId,
  });
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<{ pointId: string; error: unknown } | null>(null);
  const [statusToApply, setStatusToApply] = useState<RouteStatus | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tab, setTab] = useState<'points' | 'plan'>('points');

  const routeQuery = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => getRoute(routeId),
  });
  const route = routeQuery.data;

  const floorsQuery = useQuery({
    queryKey: ['floors', scope.objectId],
    queryFn: () => listFloors(scope.objectId as string),
    enabled: scope.objectId !== null,
  });

  const roomsQuery = useQuery({
    queryKey: ['rooms', scope.floorId],
    queryFn: () => listRooms(scope.floorId as string),
    enabled: scope.floorId !== null,
  });

  const floorRoutesQuery = useQuery({
    queryKey: ['routes', scope.floorId],
    queryFn: () => listRoutes(scope.floorId as string),
    enabled: scope.floorId !== null,
  });

  // Список объектов нужен только для подписи в шапке — тянем первую страницу.
  const objectsQuery = useQuery({
    queryKey: ['objects', { skip: 0, take: 100, search: undefined }],
    queryFn: () => listObjects({ skip: 0, take: 100 }),
    enabled: scope.objectId !== null,
  });

  const floorRows = floorsQuery.data ?? [];
  // Метка последнего прочитанного ответа: по ней отличаем «сервер прислал новые
  // данные» от повторного рендера с тем же объектом запроса.
  const lastSyncedAt = useRef(routeQuery.dataUpdatedAt);

  // Дополняем область видимости из данных: `RouteDetail.floor` объект не отдаёт,
  // но `Floor.objectId` есть в списке этажей — его и используем.
  useEffect(() => {
    if (!route) return;
    setScope((current) => {
      const nextFloorId = current.floorId ?? route.floorId;
      const nextObjectId =
        current.objectId ?? floorRows.find((item) => item.id === nextFloorId)?.objectId ?? null;
      if (nextFloorId === current.floorId && nextObjectId === current.objectId) return current;
      return { objectId: nextObjectId, floorId: nextFloorId };
    });
  }, [route, floorRows]);

  /**
   * Синхронизация черновика с ответом сервера.
   * Набор точек пересобирается целиком, значения времени обновляются только там,
   * где пользователь ещё ничего не правил: иначе инвалидация после сохранения
   * времени затирала бы несохранённое время, а сохранение порядка сбрасывало бы
   * только что расставленный порядок.
   */
  useEffect(() => {
    if (!route) return;
    const fresh = routeQuery.dataUpdatedAt !== lastSyncedAt.current;
    lastSyncedAt.current = routeQuery.dataUpdatedAt;

    setDraft((current) => {
      const currentIds = current.map((entry) => entry.point.id);
      const sameSet =
        currentIds.length === route.points.length &&
        currentIds.every((id) => route.points.some((point) => point.id === id));
      if (!sameSet) {
        return route.points.map((point) => ({ point, time: timeToInput(point.estimatedTimeMin) }));
      }
      if (!fresh) return current;
      return current.map((entry) => {
        const edited = inputToTime(entry.time) !== (entry.point.estimatedTimeMin ?? null);
        const serverPoint =
          route.points.find((point) => point.id === entry.point.id) ?? entry.point;
        return {
          point: serverPoint,
          time: edited ? entry.time : timeToInput(serverPoint.estimatedTimeMin),
        };
      });
    });
  }, [route, routeQuery.dataUpdatedAt]);

  useEffect(() => {
    if (
      route &&
      selectedPointId !== null &&
      !route.points.some((point) => point.id === selectedPointId)
    ) {
      setSelectedPointId(null);
    }
  }, [route, selectedPointId]);

  const rooms = useMemo<RoomEntity[]>(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const floorRoutes = useMemo(() => floorRoutesQuery.data ?? [], [floorRoutesQuery.data]);
  const floor = floorRows.find((item) => item.id === scope.floorId) ?? null;

  const serverIds = useMemo(() => (route ? route.points.map((point) => point.id) : []), [route]);
  const serverTimes = useMemo(
    () => new Map((route?.points ?? []).map((point) => [point.id, point.estimatedTimeMin])),
    [route],
  );

  const draftIds = draft.map((entry) => entry.point.id);
  const orderDirty =
    draftIds.length === serverIds.length && draftIds.some((id, index) => id !== serverIds[index]);
  // «Несохранённым» считается только корректное значение: пустое или нечисловое
  // поле — это незавершённый ввод, и подсвечивать из-за него кнопку «Сохранить»
  // значило бы предлагать сохранить заведомо отвергаемые данные.
  const timeDirty = draft.some((entry) => {
    const parsed = inputToTime(entry.time);
    return typeof parsed === 'number' && parsed !== serverTimes.get(entry.point.id);
  });

  // Пустое/нечисловое поле в сумму не попадает: показываем серверное значение,
  // чтобы «Итого» не прыгало на каждом нажатии клавиши при вводе числа.
  const localTotal = draft.reduce((sum, entry) => {
    const parsed = inputToTime(entry.time);
    return sum + (typeof parsed === 'number' ? parsed : (serverTimes.get(entry.point.id) ?? 0));
  }, 0);
  const savedTotal = sumDraftTime(
    draft.map((entry) => timeToInput(serverTimes.get(entry.point.id) ?? null)),
  );

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderRoutePoints(routeId, ids),
  });
  const timeMutation = useMutation({
    mutationFn: (payload: { pointId: string; estimatedTimeMin: number }) =>
      updateRoutePoint(payload.pointId, payload.estimatedTimeMin),
  });
  const addMutation = useMutation({
    mutationFn: (payload: { roomId: string; estimatedTimeMin?: number }) =>
      addRoutePoint(routeId, payload.roomId, payload.estimatedTimeMin),
  });
  const deletePointMutation = useMutation({
    mutationFn: (pointId: string) => deleteRoutePoint(pointId),
  });
  const updateRouteMutation = useMutation({
    mutationFn: (payload: { name?: string; status?: RouteStatus }) => updateRoute(routeId, payload),
  });
  const deleteRouteMutation = useMutation({
    mutationFn: () => deleteRoute(routeId),
  });

  const busy =
    reorderMutation.isPending ||
    timeMutation.isPending ||
    addMutation.isPending ||
    deletePointMutation.isPending ||
    updateRouteMutation.isPending ||
    deleteRouteMutation.isPending;

  const routeStatus: RouteStatus = route?.status ?? 'DRAFT';
  const editable = canEdit && route !== undefined && routeStatus !== 'ARCHIVED';

  /**
   * Сохранение одним действием: сначала порядок (полный список id), затем время
   * изменённых точек. Порядок первым: если `reorder` упадёт, время не будет
   * сохранено «наполовину», а черновик останется для повтора.
   */
  async function handleSave() {
    setTimeError(null);
    let failed: unknown = null;

    if (orderDirty) {
      try {
        await reorderMutation.mutateAsync(draftIds);
      } catch (error) {
        failed = error;
      }
    }

    if (failed === null) {
      for (const entry of draft) {
        const parsed = inputToTime(entry.time);
        // Пустое поле — это `null` (норма не задана), а PATCH принимает только
        // число ≥ 1: «очистить норму» через API нельзя, поэтому пустое и
        // некорректное значение просто возвращаем к серверному.
        if (typeof parsed !== 'number' || parsed === serverTimes.get(entry.point.id)) continue;
        try {
          await timeMutation.mutateAsync({ pointId: entry.point.id, estimatedTimeMin: parsed });
        } catch (error) {
          setTimeError({ pointId: entry.point.id, error });
          break;
        }
      }
    }

    setDraft((current) =>
      current.map((entry) => {
        const parsed = inputToTime(entry.time);
        if (typeof parsed === 'number') return entry;
        return { ...entry, time: timeToInput(serverTimes.get(entry.point.id) ?? null) };
      }),
    );

    await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
    await queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
  }

  function handleReorder(ids: string[]) {
    const byId = new Map(draft.map((entry) => [entry.point.id, entry]));
    const next = ids.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    });
    // Полнота набора — условие бэкенда (`reorder` отвергает неполный список).
    if (next.length !== draft.length) return;
    setDraft(next);
  }

  function handleDiscard() {
    if (!route) return;
    setDraft(route.points.map((point) => ({ point, time: timeToInput(point.estimatedTimeMin) })));
    setTimeError(null);
  }

  function handleDeletePoint(pointId: string) {
    if (!editable) return;
    // Сервер сам пересобирает orderIndex оставшихся точек (М2.5), но локальный
    // черновик нужно почистить: иначе следующий «Сохранить» отправит id удалённой точки.
    setDraft((current) => current.filter((entry) => entry.point.id !== pointId));
    deletePointMutation.mutate(pointId, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['route', routeId] });
        void queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
      },
    });
  }

  function handleAddRoom(
    room: RoomEntity,
    estimatedTimeMin: number | undefined,
    afterId: string | null,
  ) {
    addMutation.mutate(
      { roomId: room.id, estimatedTimeMin },
      {
        onSuccess: async (created) => {
          if (afterId !== null) {
            // Вставка в середину: сервер всегда добавляет точку в конец, поэтому
            // позиция доводится полным `reorder` — иначе «после выбранной» не выполнить.
            const index = draftIds.indexOf(afterId);
            const ids = [...draftIds];
            ids.splice(index + 1, 0, created.id);
            try {
              await reorderMutation.mutateAsync(ids);
            } catch {
              // Точка уже создана; ошибка порядка покажется баннером, состояние перечитается.
            }
          }
          setAddOpen(false);
          setSelectedPointId(created.id);
          await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
          await queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
        },
      },
    );
  }

  function applyStatus(status: RouteStatus) {
    if (!route || !canTransitionRoute(route.status, status)) return;
    updateRouteMutation.mutate(
      { status },
      {
        onSuccess: async () => {
          setStatusToApply(null);
          await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
          await queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
        },
      },
    );
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (trimmed.length < 3 || trimmed.length > 80) {
      setRenameError('Название — от 3 до 80 символов');
      return;
    }
    setRenameError(null);
    updateRouteMutation.mutate(
      { name: trimmed },
      {
        onSuccess: async () => {
          setRenameOpen(false);
          await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
          await queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
        },
      },
    );
  }

  if (routeQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={routeQuery.error} onRetry={() => void routeQuery.refetch()} />
        <Link to={ROUTES.routes} className="text-sm text-primary-600 hover:underline">
          ← К списку маршрутов
        </Link>
      </div>
    );
  }

  if (routeQuery.isLoading || !route) {
    return <LoadingBlock label="Загрузка маршрута…" />;
  }

  const objectName =
    objectsQuery.data?.items.find((item) => item.id === scope.objectId)?.name ?? null;
  const planObjectId = scope.objectId ?? objectId;

  const insertOptions = draft.map((entry, index) => ({
    id: entry.point.id,
    label: `${index + 1}. ${entry.point.room.name}`,
  }));

  const planPoints = draft.map((entry) => ({
    id: entry.point.id,
    room: entry.point.room,
    estimatedTimeMin: entry.time,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to={ROUTES.routes} className="text-xs text-neutral-500 hover:text-primary-600">
            ← Все маршруты
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="truncate text-lg font-medium text-neutral-900">{route.name}</h2>
            <RouteStatusBadge status={route.status} />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {floorShortName(route.floor)}
            {objectName && ` · ${objectName}`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:basis-full">
          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="route-rename"
              disabled={!editable || busy}
              onClick={() => {
                setRenameValue(route.name);
                setRenameError(null);
                setRenameOpen(true);
              }}
            >
              Переименовать
            </Button>
          )}
          {canEdit &&
            ROUTE_ALLOWED_TRANSITIONS[route.status].map((target) => (
              <Button
                key={target}
                variant={target === 'ARCHIVED' ? 'secondary' : 'primary'}
                size="sm"
                data-testid={`route-status-${target}`}
                disabled={busy}
                onClick={() => setStatusToApply(target)}
              >
                {STATUS_ACTION_LABELS[target]}
              </Button>
            ))}
          {isAdmin && (
            <Button
              variant="danger"
              size="sm"
              data-testid="route-delete"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              Удалить
            </Button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Недостаточно прав: доступен только просмотр маршрута.
        </div>
      )}

      {deletePointMutation.isError && (
        <ErrorBanner
          error={deletePointMutation.error}
          onRetry={() => deletePointMutation.reset()}
        />
      )}

      {/* Переключатель «Точки / План» — только ниже `lg` (на desktop видны обе
          панели). На телефоне он занимает всю ширину, а кнопки делят её поровну:
          это основной навигационный контрол экрана, попадать в него пальцем
          должно быть легко. На планшете и desktop правила `max-md:` не действуют. */}
      <div className="flex gap-2 lg:hidden max-md:w-full">
        <Button
          variant={tab === 'points' ? 'primary' : 'secondary'}
          size="sm"
          className="max-md:flex-1"
          data-testid="route-tab-points"
          onClick={() => setTab('points')}
        >
          Точки
        </Button>
        <Button
          variant={tab === 'plan' ? 'primary' : 'secondary'}
          size="sm"
          className="max-md:flex-1"
          data-testid="route-tab-plan"
          onClick={() => setTab('plan')}
        >
          План
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <RoutePointsPanel
          className={['lg:w-[26rem] lg:shrink-0', tab === 'plan' ? 'hidden lg:flex' : 'flex'].join(
            ' ',
          )}
          points={draft.map<RoutePointDraft>((entry) => ({
            id: entry.point.id,
            room: entry.point.room,
            estimatedTimeMin: entry.time,
          }))}
          selectedPointId={selectedPointId}
          onSelectPoint={setSelectedPointId}
          onChangeTime={(pointId, value) => {
            setTimeError((current) => (current?.pointId === pointId ? null : current));
            setDraft((current) =>
              current.map((entry) =>
                entry.point.id === pointId ? { ...entry, time: value } : entry,
              ),
            );
          }}
          onReorder={handleReorder}
          onDeletePoint={handleDeletePoint}
          onAddPoint={() => setAddOpen(true)}
          onSave={() => void handleSave()}
          onDiscard={handleDiscard}
          orderDirty={orderDirty}
          timeDirty={timeDirty}
          saving={busy}
          saveError={reorderMutation.error}
          timeError={timeError}
          actionError={
            addMutation.isError
              ? errorMessage(addMutation.error)
              : updateRouteMutation.isError
                ? errorMessage(updateRouteMutation.error)
                : null
          }
          serverTotal={savedTotal}
          localTotal={localTotal}
          status={route.status}
          disabled={!editable || busy}
          canEdit={canEdit}
          headerActions={
            floorRoutes.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {floorRoutes.map((item) => (
                  <Link
                    key={item.id}
                    to={`${ROUTES.route(item.id)}?floorId=${encodeURIComponent(item.floorId)}${
                      planObjectId ? `&objectId=${encodeURIComponent(planObjectId)}` : ''
                    }`}
                    className={[
                      'rounded-md border px-2 py-1 text-xs',
                      item.id === routeId
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50',
                    ].join(' ')}
                  >
                    {item.name}
                    <span className="ml-1 font-mono text-neutral-400">{item.points.length}</span>
                  </Link>
                ))}
              </div>
            ) : null
          }
        />

        <FloorPlanPanel
          className={['min-w-0 flex-1', tab === 'points' ? 'hidden lg:block' : 'block'].join(' ')}
          floor={floor}
          floorFallback={{
            id: route.floor.id,
            name: route.floor.name,
            number: route.floor.number,
            planImageUrl: route.floor.planImageUrl,
          }}
          points={planPoints}
          rooms={rooms}
          selectedPointId={selectedPointId}
          onSelectPoint={setSelectedPointId}
          onAddRoom={(room) => {
            if (!editable || addMutation.isPending) return;
            handleAddRoom(room, undefined, null);
          }}
          disabled={!editable || busy}
          roomsLoading={roomsQuery.isLoading}
          roomsError={roomsQuery.isError ? roomsQuery.error : null}
          onRetryRooms={() => void roomsQuery.refetch()}
          objectId={planObjectId}
        />
      </div>

      <AddPointModal
        open={addOpen}
        rooms={rooms}
        roomsLoading={roomsQuery.isLoading}
        roomsError={roomsQuery.isError ? roomsQuery.error : null}
        usedRoomIds={new Set(draft.map((entry) => entry.point.room.id))}
        insertOptions={insertOptions}
        defaultAfterId={selectedPointId}
        busy={busy}
        error={addMutation.isError ? addMutation.error : null}
        onRetryRooms={() => void roomsQuery.refetch()}
        onClose={() => setAddOpen(false)}
        onSubmit={({ roomId, estimatedTimeMin, afterId }) => {
          const room = rooms.find((item) => item.id === roomId);
          if (!room) return;
          handleAddRoom(room, estimatedTimeMin, afterId);
        }}
      />

      <Modal
        open={renameOpen}
        title="Переименовать маршрут"
        onClose={() => setRenameOpen(false)}
        busy={updateRouteMutation.isPending}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRenameOpen(false)}
              disabled={updateRouteMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              data-testid="route-rename-submit"
              onClick={submitRename}
              loading={updateRouteMutation.isPending}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {updateRouteMutation.isError && <ErrorBanner error={updateRouteMutation.error} />}
          <Field
            label="Название"
            htmlFor="route-rename-name"
            required
            error={renameError}
            hint="3–80 символов"
          >
            <Input
              id="route-rename-name"
              data-testid="route-rename-input"
              value={renameValue}
              invalid={renameError !== null}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={statusToApply !== null}
        title={statusToApply ? `Смена статуса: ${STATUS_ACTION_LABELS[statusToApply]}` : ''}
        message={
          statusToApply === 'ACTIVE'
            ? 'Маршрут станет активным и сможет попасть в планирование смен.'
            : statusToApply === 'ARCHIVED'
              ? 'Маршрут перейдёт в архив и не будет использоваться в планировании. Переход необратим.'
              : 'Маршрут вернётся в черновик — правки порядка снова станут возможны.'
        }
        confirmLabel={statusToApply ? STATUS_ACTION_LABELS[statusToApply] : 'Подтвердить'}
        cancelLabel="Отмена"
        variant={statusToApply === 'ARCHIVED' ? 'danger' : 'primary'}
        busy={updateRouteMutation.isPending}
        onCancel={() => setStatusToApply(null)}
        onConfirm={() => {
          if (statusToApply) applyStatus(statusToApply);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Удаление маршрута"
        message={`Маршрут «${route.name}» и его ${route.points.length} точек будут удалены безвозвратно.`}
        confirmLabel="Удалить"
        busy={deleteRouteMutation.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteRouteMutation.mutate(undefined, {
            onSuccess: async () => {
              await queryClient.invalidateQueries({ queryKey: ['routes', scope.floorId] });
              navigate(ROUTES.routes);
            },
          })
        }
      />
    </div>
  );
}
