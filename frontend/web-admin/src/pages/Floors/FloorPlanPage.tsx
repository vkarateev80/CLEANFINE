import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  attachFloorPlanUrl,
  createRoom,
  deleteRoom,
  getFloorDetail,
  listTechCards,
  updateFloor,
  updateRoom,
  uploadFloorPlan,
} from '../../api/core';
import {
  Breadcrumbs,
  Button,
  ConfirmDialog,
  ErrorBanner,
  Input,
  SoftWarning,
  Spinner,
} from '../../components/ui';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import type { UpdateFloorPayload } from '../../types/core';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { FloorSettingsModal } from './FloorSettingsModal';
import { PlanUploadModal } from './PlanUploadModal';
import { RoomCreateModal } from './RoomCreateModal';
import { RoomEditorDrawer } from './RoomEditorDrawer';
import { RoomListPanel } from './RoomListPanel';
import {
  ZOOM_STEP,
  clampZoom,
  distinctRoomValues,
  downloadRoomsCsv,
  formatArea,
  isPdfPlanUrl,
  roomRect,
  zoomPercent,
  type PlanSize,
  type Rect,
} from './floorPlanUtils';
import { roomCreatePayload, roomUpdatePayload, type RoomFormValues } from './roomForm';

/**
 * Экран «План этажа + редактор помещений» (М2.7), маршрут /objects/:id/floors/:floorId.
 * Спецификация: design/screens/web-admin/floor_plan.md
 */
export function FloorPlanPage() {
  const params = useParams<{ id: string; floorId: string }>();
  const urlObjectId = params.id ?? '';
  const floorId = params.floorId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitNonce, setFitNonce] = useState(0);
  const [planSize, setPlanSize] = useState<PlanSize | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Rect>>({});
  const [createDraft, setCreateDraft] = useState<{ rect: Rect | null } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [scaleInput, setScaleInput] = useState('');
  const [scaleError, setScaleError] = useState<string | null>(null);

  const floorQuery = useQuery({
    queryKey: ['floor', floorId],
    queryFn: () => {
      if (!floorId) throw new Error('Не указан этаж');
      return getFloorDetail(floorId);
    },
    enabled: Boolean(floorId),
  });
  const floor = floorQuery.data;

  const techCardsQuery = useQuery({
    queryKey: ['tech-cards', { skip: 0, take: 100 }],
    queryFn: () => listTechCards({ skip: 0, take: 100 }),
  });
  const techCards = techCardsQuery.data?.items ?? [];

  function requireFloorId(): string {
    if (!floorId) throw new Error('Не указан этаж');
    return floorId;
  }

  const invalidateFloor = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['floor', floorId] });
  }, [queryClient, floorId]);

  const createMutation = useMutation({
    mutationFn: (values: RoomFormValues) => createRoom(requireFloorId(), roomCreatePayload(values)),
    onSuccess: (room) => {
      setCreateDraft(null);
      setSelectedRoomId(room.id);
      invalidateFloor();
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: (args: { roomId: string; values: RoomFormValues }) =>
      updateRoom(args.roomId, roomUpdatePayload(args.values)),
    onSuccess: (_room, args) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[args.roomId];
        return next;
      });
      setSelectedRoomId(null);
      invalidateFloor();
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: string) => deleteRoom(roomId),
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedRoomId(null);
      invalidateFloor();
    },
  });

  const floorMutation = useMutation({
    mutationFn: (payload: UpdateFloorPayload) => updateFloor(requireFloorId(), payload),
    onSuccess: () => {
      setSettingsOpen(false);
      invalidateFloor();
    },
  });

  const scaleMutation = useMutation({
    mutationFn: (payload: UpdateFloorPayload) => updateFloor(requireFloorId(), payload),
    onSuccess: () => {
      setScaleError(null);
      invalidateFloor();
    },
  });

  const planMutation = useMutation({
    mutationFn: (args: { file: File; scale?: number }) =>
      uploadFloorPlan(requireFloorId(), args.file, args.scale),
    onSuccess: () => {
      setUploadOpen(false);
      setFileError(null);
      invalidateFloor();
    },
  });

  const attachPlanMutation = useMutation({
    mutationFn: (args: { url: string; scale?: number }) =>
      attachFloorPlanUrl(requireFloorId(), args.url, args.scale),
    onSuccess: () => {
      setUploadOpen(false);
      setFileError(null);
      invalidateFloor();
    },
  });

  // Смена этажа в адресе — состояние области плана начинается заново.
  useEffect(() => {
    setPlanSize(null);
    setDrafts({});
    setSelectedRoomId(null);
    setHoveredRoomId(null);
    setAddMode(false);
    setZoom(1);
    setFitNonce((value) => value + 1);
  }, [floorId]);

  useEffect(() => {
    const scale = floor?.planScale;
    setScaleInput(scale === null || scale === undefined ? '' : String(scale));
  }, [floor?.planScale]);

  const rooms = useMemo(() => floor?.rooms ?? [], [floor]);
  const planImageUrl = floor?.planImageUrl ?? null;
  const isPdf = isPdfPlanUrl(planImageUrl);
  const drawingAvailable = Boolean(planImageUrl) && !isPdf && canEdit;

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const deleteTargetRoom = rooms.find((room) => room.id === deleteTarget) ?? null;
  const floorTypeOptions = useMemo(() => distinctRoomValues(rooms, 'floorType'), [rooms]);
  const roomsWithCoords = rooms.filter((room) => roomRect(room) !== null).length;
  const totalArea = rooms.reduce((sum, room) => sum + room.areaM2, 0);

  const routesWithDeletedRoom = useMemo(() => {
    if (!floor || !deleteTarget) return [];
    return floor.routes.filter((route) =>
      route.points.some((point) => point.roomId === deleteTarget),
    );
  }, [floor, deleteTarget]);

  const objectName = floor?.object.name ?? '';
  const floorTitle = floor ? floor.name || `Этаж ${floor.number}` : 'План этажа';

  const updateRoomError =
    updateRoomMutation.isError && updateRoomMutation.variables?.roomId === selectedRoomId
      ? updateRoomMutation.error
      : null;
  const planError = planMutation.error ?? attachPlanMutation.error;

  const handleSelect = useCallback((roomId: string | null) => {
    setSelectedRoomId(roomId);
    if (roomId) setPanelOpen(false);
  }, []);

  const handleRectChange = useCallback((roomId: string, rect: Rect) => {
    setDrafts((current) => ({ ...current, [roomId]: rect }));
    // Сохраняет геометрию только карточка помещения — открываем её сразу.
    setSelectedRoomId(roomId);
  }, []);

  const handleCreateRect = useCallback((rect: Rect) => {
    setCreateDraft({ rect });
    setAddMode(false);
  }, []);

  function closeDrawer() {
    updateRoomMutation.reset();
    setSelectedRoomId(null);
  }

  function closeCreateModal() {
    createMutation.reset();
    setCreateDraft(null);
  }

  function closeUploadModal() {
    planMutation.reset();
    attachPlanMutation.reset();
    setFileError(null);
    setUploadOpen(false);
  }

  function closeSettingsModal() {
    floorMutation.reset();
    setSettingsOpen(false);
  }

  function handleSaveScale() {
    const parsed = scaleInput.trim() === '' ? null : Number(scaleInput);
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
      setScaleError('Масштаб: число больше 0');
      return;
    }
    setScaleError(null);
    scaleMutation.mutate({ planScale: parsed });
  }

  function handleExport() {
    downloadRoomsCsv(objectName, floorTitle, rooms);
  }

  if (!floorId) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: 'Объекты', to: ROUTES.objects }, { label: 'План этажа' }]} />
        <ErrorBanner error={new Error('В адресе не указан этаж')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Breadcrumbs
            items={[
              { label: 'Объекты', to: ROUTES.objects },
              {
                label: objectName || 'Объект',
                to: urlObjectId ? ROUTES.object(urlObjectId) : undefined,
              },
              { label: floorTitle },
            ]}
          />
          <h1 className="text-2xl font-semibold text-neutral-900">{floorTitle}</h1>
          <div className="text-sm text-neutral-500">
            {objectName && `${objectName} · `}
            <span className="font-mono">{rooms.length}</span> помещений ·{' '}
            <span className="font-mono">{formatArea(totalArea)}</span> м²
          </div>
        </div>

        {floor && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
              <Button
                variant={addMode ? 'ghost' : 'primary'}
                size="sm"
                aria-pressed={!addMode}
                onClick={() => setAddMode(false)}
              >
                Просмотр
              </Button>
              <Button
                variant={addMode ? 'primary' : 'ghost'}
                size="sm"
                data-testid="add-mode-toggle"
                aria-pressed={addMode}
                disabled={!drawingAvailable}
                title={
                  drawingAvailable
                    ? 'Протяните рамку по плану'
                    : 'Рисование недоступно: нужен растровый план и права на правку'
                }
                onClick={() => {
                  setSelectedRoomId(null);
                  setAddMode((value) => !value);
                }}
              >
                Добавить помещение
              </Button>
            </div>

            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="room-create-manual"
                onClick={() => setCreateDraft({ rect: null })}
              >
                Указать координаты
              </Button>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Уменьшить масштаб"
                data-testid="zoom-out"
                onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
              >
                −
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Масштаб 100 процентов"
                onClick={() => setZoom(1)}
              >
                {zoomPercent(zoom)} %
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Увеличить масштаб"
                data-testid="zoom-in"
                onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
              >
                +
              </Button>
              <Button
                variant="secondary"
                size="sm"
                data-testid="zoom-fit"
                onClick={() => setFitNonce((value) => value + 1)}
              >
                Вписать
              </Button>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                Масштаб, м/пкс
                <div className="w-24 shrink-0">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    className="font-mono"
                    aria-label="Масштаб: метров в пикселе"
                    data-testid="floor-plan-scale"
                    value={scaleInput}
                    onChange={(event) => setScaleInput(event.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={scaleMutation.isPending}
                  onClick={handleSaveScale}
                >
                  Сохранить
                </Button>
                {floor.planScale !== null && (
                  <span className="text-neutral-400">1 px ≈ {floor.planScale} м</span>
                )}
                {scaleError && <span className="text-danger-600">{scaleError}</span>}
              </div>
            )}

            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="floor-plan-upload-open"
                onClick={() => setUploadOpen(true)}
              >
                {planImageUrl ? 'Заменить план' : 'Загрузить план'}
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              data-testid="routes-link"
              onClick={() => navigate(`${ROUTES.routes}?floorId=${floor.id}`)}
            >
              Маршруты этажа ({floor.routes.length})
            </Button>

            <Button variant="ghost" size="sm" data-testid="export-csv" onClick={handleExport}>
              Экспорт CSV
            </Button>

            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="floor-settings-open"
                onClick={() => setSettingsOpen(true)}
              >
                Параметры этажа
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              aria-label="Показать экспликацию"
              onClick={() => setPanelOpen((value) => !value)}
            >
              Экспликация
            </Button>
          </div>
        )}
      </div>

      {floorQuery.isError && (
        <ErrorBanner
          error={floorQuery.error}
          onRetry={() => {
            void floorQuery.refetch();
          }}
        />
      )}
      {floor && !canEdit && (
        <SoftWarning>
          Режим просмотра: роль не позволяет менять план, помещения и параметры этажа.
        </SoftWarning>
      )}
      {floor && floor.objectId !== urlObjectId && (
        <SoftWarning>
          Этаж принадлежит объекту «{floor.object.name}», а адрес ведёт в другой объект. Ссылки в
          крошках построены по адресу.
        </SoftWarning>
      )}
      {planError && !uploadOpen && (
        <ErrorBanner error={planError} onRetry={() => setUploadOpen(true)} />
      )}
      {deleteRoomMutation.isError && <ErrorBanner error={deleteRoomMutation.error} />}

      {floorQuery.isLoading && (
        <div className="flex h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="hidden w-80 shrink-0 flex-col gap-3 border-r border-neutral-200 p-4 lg:flex">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="h-14 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center bg-neutral-100">
            <Spinner />
          </div>
        </div>
      )}

      {floor && (
        <div className="relative flex h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <aside
            className={[
              'absolute inset-y-0 left-0 z-30 w-80 max-w-[85%] shrink-0 overflow-y-auto border-r border-neutral-200 bg-white transition-transform',
              'lg:static lg:z-auto lg:max-w-none lg:translate-x-0',
              panelOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <RoomListPanel
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              hoveredRoomId={hoveredRoomId}
              canEdit={canEdit}
              draftRects={drafts}
              onSelect={handleSelect}
              onHover={setHoveredRoomId}
              onCreate={() => setCreateDraft({ rect: null })}
            />
          </aside>

          {panelOpen && (
            <button
              type="button"
              aria-label="Закрыть экспликацию"
              className="absolute inset-0 z-20 bg-neutral-900/30 lg:hidden"
              onClick={() => setPanelOpen(false)}
            />
          )}

          <FloorPlanCanvas
            planImageUrl={planImageUrl}
            isPdf={isPdf}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            hoveredRoomId={hoveredRoomId}
            canEdit={canEdit}
            addMode={addMode}
            zoom={zoom}
            fitNonce={fitNonce}
            draftRects={drafts}
            dropZoneTestId={uploadOpen ? undefined : 'floor-plan-upload'}
            fileError={fileError}
            uploading={planMutation.isPending}
            onFileError={setFileError}
            onZoomChange={setZoom}
            onPlanSizeChange={setPlanSize}
            onSelect={handleSelect}
            onHover={setHoveredRoomId}
            onCreateRect={handleCreateRect}
            onRectChange={handleRectChange}
            onUploadFile={(file) =>
              planMutation.mutate({ file, scale: floor.planScale ?? undefined })
            }
          />

          {selectedRoom && (
            <RoomEditorDrawer
              key={selectedRoom.id}
              room={selectedRoom}
              draftRect={drafts[selectedRoom.id] ?? null}
              planSize={planSize}
              planImageAvailable={Boolean(planImageUrl)}
              planScale={floor.planScale}
              techCards={techCards}
              floorTypeOptions={floorTypeOptions}
              canEdit={canEdit}
              isAdmin={isAdmin}
              busy={updateRoomMutation.isPending}
              error={updateRoomError}
              onSubmit={(values) =>
                updateRoomMutation.mutate({ roomId: selectedRoom.id, values })
              }
              onDelete={() => setDeleteTarget(selectedRoom.id)}
              onClose={closeDrawer}
            />
          )}
        </div>
      )}

      {floor && createDraft && (
        <RoomCreateModal
          open
          rect={createDraft.rect}
          planImageAvailable={Boolean(planImageUrl)}
          planSize={planSize}
          planScale={floor.planScale}
          techCards={techCards}
          floorTypeOptions={floorTypeOptions}
          suggestedName={`Помещение ${rooms.length + 1}`}
          suggestedFloorType={rooms[rooms.length - 1]?.floorType ?? ''}
          busy={createMutation.isPending}
          error={createMutation.error}
          onSubmit={(values) => createMutation.mutate(values)}
          onClose={closeCreateModal}
        />
      )}

      {floor && settingsOpen && (
        <FloorSettingsModal
          open
          floor={floor}
          busy={floorMutation.isPending}
          error={floorMutation.error}
          onSubmit={(payload) => floorMutation.mutate(payload)}
          onClose={closeSettingsModal}
        />
      )}

      {floor && uploadOpen && (
        <PlanUploadModal
          open
          roomsWithCoords={roomsWithCoords}
          planScale={floor.planScale}
          busy={planMutation.isPending || attachPlanMutation.isPending}
          error={planError}
          onSubmit={(file, scale) =>
            planMutation.mutate({ file, scale: scale ?? undefined })
          }
          onAttachUrl={(url, scale) =>
            attachPlanMutation.mutate({ url, scale: scale ?? undefined })
          }
          onClose={closeUploadModal}
        />
      )}

      <ConfirmDialog
        open={deleteTargetRoom !== null}
        title="Удаление помещения"
        message={
          deleteTargetRoom ? (
            <div className="flex flex-col gap-2">
              <span>Удалить помещение «{deleteTargetRoom.name}»?</span>
              {routesWithDeletedRoom.length > 0 && (
                <span className="text-warning-600">
                  Помещение входит в маршрут(ы):{' '}
                  {routesWithDeletedRoom.map((route) => route.name).join(', ')}. Точки этих
                  маршрутов будут удалены вместе с помещением.
                </span>
              )}
            </div>
          ) : (
            ''
          )
        }
        busy={deleteRoomMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteRoomMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
