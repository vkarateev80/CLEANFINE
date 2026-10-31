import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { COLOR_ZONE_META, roomColorZone } from '@cleaning-ops/shared/types/color-coding';
import { Button, ColorZoneLegend, EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import type { RoomWithTechCard } from '../../types/core';
import { PlanDropZone } from './PlanDropZone';
import {
  MIN_DRAW_SIZE,
  PLAN_FORMATS_HINT,
  clamp,
  clampZoom,
  defaultRectAt,
  isLiftZoneRoom,
  liftHatchImage,
  moveRect,
  normalizeRect,
  resizeRect,
  roomNumbers,
  roomRect,
  zoomPercent,
  type Corner,
  type PlanSize,
  type Point,
  type Rect,
} from './floorPlanUtils';

interface FloorPlanCanvasProps {
  planImageUrl: string | null;
  isPdf: boolean;
  rooms: RoomWithTechCard[];
  /** Найденные фильтром экспликации: они подсвечены, остальные бледнеют. `null` — фильтра нет. */
  highlightedRoomIds: ReadonlySet<string> | null;
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  canEdit: boolean;
  /**
   * Разрешены ли жесты правки геометрии: рисование рамкой, перемещение помещения
   * и ресайз за угол. На телефоне (<768 px) — `false`: палец закрывает маркер, а
   * точность указания падает ниже осмысленной (System Design §7.6). Просмотр,
   * зум, панорама и выбор помещения при этом продолжают работать.
   *
   * Признак приходит пропом, а не берётся из CSS: это не вид, а поведение —
   * pointer-события нельзя «выключить» классом, не тронув панорамирование
   * (оно живёт на том же слое).
   */
  drawEnabled: boolean;
  addMode: boolean;
  zoom: number;
  /** Инкремент — команда «Вписать»: canvas сам считает масштаб под свою область. */
  fitNonce: number;
  draftRects: Record<string, Rect>;
  /** id зоны загрузки в состоянии «плана нет»: пока открыта модалка, он не нужен. */
  dropZoneTestId?: string;
  fileError: string | null;
  uploading: boolean;
  onFileError: (message: string | null) => void;
  onZoomChange: (zoom: number) => void;
  onPlanSizeChange: (size: PlanSize | null) => void;
  onSelect: (roomId: string | null) => void;
  onHover: (roomId: string | null) => void;
  onCreateRect: (rect: Rect) => void;
  onRectChange: (roomId: string, rect: Rect) => void;
  onUploadFile: (file: File) => void;
}

/** Пока изображение не измерилось, область рисуется с этим соотношением сторон. */
const FALLBACK_SIZE: PlanSize = { width: 1000, height: 700 };

type Interaction =
  | {
      kind: 'pan';
      startX: number;
      startY: number;
      scrollLeft: number;
      scrollTop: number;
      deselect: boolean;
    }
  | { kind: 'draw'; start: Point }
  | { kind: 'move'; roomId: string; start: Point; origin: Rect }
  | { kind: 'resize'; roomId: string; corner: Corner; origin: Rect };

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

const CORNER_CLASS: Record<Corner, string> = {
  nw: '-left-1 -top-1 cursor-nwse-resize',
  ne: '-right-1 -top-1 cursor-nesw-resize',
  sw: '-bottom-1 -left-1 cursor-nesw-resize',
  se: '-bottom-1 -right-1 cursor-nwse-resize',
};

/**
 * Область плана: зум, панорамирование, рисование рамки и правка геометрии помещений.
 * Клик по фону задаёт координаты нового помещения (в режиме добавления).
 */
export function FloorPlanCanvas({
  planImageUrl,
  isPdf,
  rooms,
  highlightedRoomIds,
  selectedRoomId,
  hoveredRoomId,
  canEdit,
  drawEnabled,
  addMode,
  zoom,
  fitNonce,
  draftRects,
  dropZoneTestId,
  fileError,
  uploading,
  onFileError,
  onZoomChange,
  onPlanSizeChange,
  onSelect,
  onHover,
  onCreateRect,
  onRectChange,
  onUploadFile,
}: FloorPlanCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const lastFitRef = useRef(-1);
  const pendingScrollRef = useRef<{
    imageX: number;
    imageY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [natural, setNatural] = useState<PlanSize | null>(null);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [live, setLive] = useState<{ roomId: string; rect: Rect } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);

  const numbers = useMemo(() => roomNumbers(rooms), [rooms]);
  const withoutCoords = rooms.filter((room) => roomRect(room) === null).length;
  const highlightedOnPlan = highlightedRoomIds
    ? rooms.filter(
        (room) =>
          highlightedRoomIds.has(room.id) && (draftRects[room.id] ?? roomRect(room)) !== null,
      ).length
    : 0;

  // Новый план — новые границы координат: измерение и «Вписать» начинаются заново.
  useEffect(() => {
    setNatural(null);
    setImageStatus('loading');
    lastFitRef.current = -1;
    onPlanSizeChange(null);
  }, [planImageUrl, onPlanSizeChange]);

  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !natural) return;
    const padding = 32;
    const width = viewport.clientWidth - padding;
    const height = viewport.clientHeight - padding;
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / natural.width, height / natural.height);
    if (!Number.isFinite(scale) || scale <= 0) return;
    onZoomChange(clampZoom(scale));
  }, [natural, onZoomChange]);

  useLayoutEffect(() => {
    if (!natural || fitNonce === lastFitRef.current) return;
    lastFitRef.current = fitNonce;
    fitToViewport();
  }, [fitNonce, natural, fitToViewport]);

  // Ctrl+колесо масштабирует к курсору; обычное колесо остаётся нативным скроллом.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const content = contentRef.current;
      const element = viewportRef.current;
      if (!content || !element || !natural || event.deltaY === 0) return;
      const next = clampZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
      if (next === zoom) return;
      const contentBox = content.getBoundingClientRect();
      const viewportBox = element.getBoundingClientRect();
      pendingScrollRef.current = {
        imageX: (event.clientX - contentBox.left) / zoom,
        imageY: (event.clientY - contentBox.top) / zoom,
        offsetX: event.clientX - viewportBox.left,
        offsetY: event.clientY - viewportBox.top,
      };
      onZoomChange(next);
    }

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [zoom, natural, onZoomChange]);

  // После зума возвращаем курсор на ту же точку изображения.
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    const viewport = viewportRef.current;
    if (!pending || !viewport) return;
    pendingScrollRef.current = null;
    viewport.scrollLeft = pending.imageX * zoom - pending.offsetX;
    viewport.scrollTop = pending.imageY * zoom - pending.offsetY;
  }, [zoom]);

  useEffect(() => {
    function isFormTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
    }
    function onKeyDown(event: KeyboardEvent) {
      // Пробел в поле поиска должен оставаться пробелом, а не режимом панорамы.
      if (event.code !== 'Space' || isFormTarget(event.target)) return;
      event.preventDefault();
      setSpaceHeld(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setSpaceHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function toPlanPoint(clientX: number, clientY: number): Point {
    const content = contentRef.current;
    const size = natural ?? FALLBACK_SIZE;
    if (!content) return { x: 0, y: 0 };
    const box = content.getBoundingClientRect();
    return {
      x: clamp((clientX - box.left) / zoom, 0, size.width),
      y: clamp((clientY - box.top) / zoom, 0, size.height),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!planImageUrl || isPdf) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.button === 0 && addMode && canEdit && drawEnabled) {
      const start = toPlanPoint(event.clientX, event.clientY);
      interactionRef.current = { kind: 'draw', start };
      setPreview({ x: start.x, y: start.y, width: 0, height: 0 });
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const wantsPan = event.button === 1 || spaceHeld || event.button === 0;
    if (!wantsPan) return;
    interactionRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      // Клик по фону (без протяжки) снимает выделение — так закрывается карточка.
      deselect: event.button === 0 && !spaceHeld,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    const plan = natural;
    const viewport = viewportRef.current;
    if (!interaction || !plan || !viewport) return;

    if (interaction.kind === 'pan') {
      viewport.scrollLeft = interaction.scrollLeft - (event.clientX - interaction.startX);
      viewport.scrollTop = interaction.scrollTop - (event.clientY - interaction.startY);
      return;
    }

    const point = toPlanPoint(event.clientX, event.clientY);
    if (interaction.kind === 'draw') {
      setPreview(normalizeRect(interaction.start, point));
      return;
    }
    if (interaction.kind === 'move') {
      setLive({
        roomId: interaction.roomId,
        rect: moveRect(
          interaction.origin,
          point.x - interaction.start.x,
          point.y - interaction.start.y,
          plan,
        ),
      });
      return;
    }
    setLive({
      roomId: interaction.roomId,
      rect: resizeRect(interaction.origin, interaction.corner, point, plan),
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!interaction) return;

    const plan = natural;

    if (interaction.kind === 'draw') {
      setPreview(null);
      if (!plan) return;
      const swept = normalizeRect(interaction.start, toPlanPoint(event.clientX, event.clientY));
      const drawn = swept.width >= MIN_DRAW_SIZE && swept.height >= MIN_DRAW_SIZE;
      onCreateRect(drawn ? swept : defaultRectAt(interaction.start, plan));
      return;
    }

    if (interaction.kind === 'move' || interaction.kind === 'resize') {
      setLive(null);
      if (!plan) return;
      const point = toPlanPoint(event.clientX, event.clientY);
      const rect =
        interaction.kind === 'move'
          ? moveRect(
              interaction.origin,
              point.x - interaction.start.x,
              point.y - interaction.start.y,
              plan,
            )
          : resizeRect(interaction.origin, interaction.corner, point, plan);
      onRectChange(interaction.roomId, rect);
      return;
    }

    if (
      interaction.deselect &&
      Math.abs(event.clientX - interaction.startX) < 3 &&
      Math.abs(event.clientY - interaction.startY) < 3
    ) {
      onSelect(null);
    }
  }

  function handleRoomPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    roomId: string,
    origin: Rect,
  ) {
    // Пробел оставлен панораме: событие должно дойти до слоя плана.
    if (event.button !== 0 || addMode || spaceHeld) return;

    // Телефон (<768 px): перемещение рамки пальцем выключено, но тап по
    // помещению обязан его выбирать — иначе рамка на телефоне становится
    // «мёртвой зоной», а единственным путём к карточке остаётся экспликация.
    if (!drawEnabled) {
      event.stopPropagation();
      onSelect(roomId);
      return;
    }

    if (!canEdit) return;
    event.stopPropagation();
    interactionRef.current = {
      kind: 'move',
      roomId,
      start: toPlanPoint(event.clientX, event.clientY),
      origin,
    };
    setDragging(true);
    onSelect(roomId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLSpanElement>,
    roomId: string,
    corner: Corner,
    origin: Rect,
  ) {
    if (event.button !== 0 || !canEdit) return;
    event.stopPropagation();
    interactionRef.current = { kind: 'resize', roomId, corner, origin };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  if (!planImageUrl) {
    return (
      <div
        data-testid="floor-plan-canvas"
        className="flex flex-1 flex-col items-center justify-center gap-3 overflow-auto bg-neutral-100 p-6"
      >
        <div className="w-full max-w-md">
          <EmptyState
            title="План этажа не загружен"
            hint={`Загрузите ${PLAN_FORMATS_HINT}. Пока плана нет, координаты помещений задать нельзя: бэкенд отклонит такой запрос.`}
            action={
              canEdit ? (
                <div className="w-full">
                  <PlanDropZone
                    testId={dropZoneTestId}
                    disabled={uploading}
                    onInvalid={onFileError}
                    onFile={onUploadFile}
                  />
                  {uploading && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-neutral-500">
                      <Spinner />
                      Загрузка плана…
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-neutral-400">
                  Загрузить план может администратор или супервайзер.
                </span>
              )
            }
          />
        </div>
        {fileError && (
          <ErrorBanner error={new Error(fileError)} onRetry={() => onFileError(null)} />
        )}
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        data-testid="floor-plan-canvas"
        className="flex flex-1 items-center justify-center overflow-auto bg-neutral-100 p-6"
      >
        <EmptyState
          title="PDF-план нельзя редактировать в браузере"
          hint="Координаты помещений для PDF задаются только числовыми полями в карточке помещения."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(planImageUrl, '_blank', 'noopener')}
            >
              Открыть PDF в новой вкладке
            </Button>
          }
        />
      </div>
    );
  }

  const contentSize = natural ?? FALLBACK_SIZE;
  const cursor =
    dragging || spaceHeld
      ? 'cursor-grabbing'
      : addMode && canEdit
        ? 'cursor-crosshair'
        : 'cursor-default';

  return (
    <div
      data-testid="floor-plan-canvas"
      className="relative flex min-w-0 flex-1 flex-col bg-neutral-100"
    >
      {fileError && (
        <div className="p-4 pb-0">
          <ErrorBanner error={new Error(fileError)} onRetry={() => onFileError(null)} />
        </div>
      )}
      {imageStatus === 'error' && (
        <div className="p-4 pb-0">
          <ErrorBanner
            error={new Error('Не удалось открыть изображение плана')}
            onRetry={() => {
              setImageStatus('loading');
              setReloadNonce((nonce) => nonce + 1);
            }}
          />
        </div>
      )}

      <div ref={viewportRef} className={['relative flex-1 overflow-auto', cursor].join(' ')}>
        <div
          ref={contentRef}
          data-testid="plan-click-layer"
          className="relative select-none"
          style={{ width: contentSize.width * zoom, height: contentSize.height * zoom }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            key={reloadNonce}
            data-testid="floor-plan-image"
            src={planImageUrl}
            alt="План этажа"
            draggable={false}
            className="block h-full w-full"
            onLoad={(event) => {
              const image = event.currentTarget;
              const size =
                image.naturalWidth > 0 && image.naturalHeight > 0
                  ? { width: image.naturalWidth, height: image.naturalHeight }
                  : null;
              setNatural(size);
              setImageStatus('ready');
              onPlanSizeChange(size);
            }}
            onError={() => setImageStatus('error')}
          />

          {imageStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-200">
              <Spinner />
            </div>
          )}

          {rooms.map((room) => {
            const stored = draftRects[room.id] ?? roomRect(room);
            if (!stored) return null;
            const rect = live && live.roomId === room.id ? live.rect : stored;
            const selected = room.id === selectedRoomId;
            const hovered = room.id === hoveredRoomId;
            const missingTechCard = room.techCard === null;
            // Цвет инвентаря помещения (красный/синий/зелёный/жёлтый) — заливка
            // и обводка рамки: план сразу показывает, какой инвентарь здесь
            // работает. Состояния (выбрано/наведено/без техкарты) — толщиной,
            // пунктиром и плотностью заливки, чтобы цвет зоны не терялся.
            const colorZone = roomColorZone(room);
            const zoneMeta = COLOR_ZONE_META[colorZone];
            const highlighted = highlightedRoomIds?.has(room.id) ?? false;
            // Выбранное и наведённое не бледнеют: иначе карточка открыта, а рамки не видно.
            const dimmed = highlightedRoomIds !== null && !highlighted && !selected && !hovered;
            const fillAlpha = selected || highlighted ? '66' : hovered ? '4D' : '33';
            // Лифтовый холл остаётся синим по инвентарю, но на плане штрихуется.
            const lift = isLiftZoneRoom(room);
            return (
              <div
                key={room.id}
                title={`${room.name} · ${zoneMeta.name.toLowerCase()} инвентарь${lift ? ' · лифтовая зона' : ''}`}
                data-color-zone={colorZone}
                data-lift-zone={lift ? 'true' : undefined}
                data-highlighted={highlighted ? 'true' : undefined}
                data-dimmed={dimmed ? 'true' : undefined}
                onPointerDown={(event) => handleRoomPointerDown(event, room.id, rect)}
                onMouseEnter={() => onHover(room.id)}
                onMouseLeave={() => onHover(null)}
                style={{
                  left: rect.x * zoom,
                  top: rect.y * zoom,
                  width: rect.width * zoom,
                  height: rect.height * zoom,
                  borderColor: zoneMeta.hex,
                  backgroundColor: `${zoneMeta.hex}${fillAlpha}`,
                  ...(lift ? { backgroundImage: liftHatchImage(zoneMeta.hex) } : {}),
                }}
                className={[
                  'absolute border transition',
                  // В режиме рисования рамки не перехватывают указатель: иначе drag
                  // начинался бы над помещением, а не на свободном месте плана.
                  addMode ? 'pointer-events-none' : '',
                  dimmed ? 'opacity-20' : '',
                  selected
                    ? 'border-2 ring-2 ring-primary-600 ring-offset-1'
                    : highlighted
                      ? 'border-2'
                      : missingTechCard
                        ? 'border-dashed'
                        : '',
                  canEdit && drawEnabled && !addMode ? 'cursor-move' : 'cursor-pointer',
                ].join(' ')}
              >
                {zoomPercent(zoom) >= 50 && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-sm bg-white px-1 text-xs font-medium"
                    style={{ color: zoneMeta.hexDark }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: zoneMeta.hex }}
                    />
                    {numbers.get(room.id) ?? 0} · {room.name}
                  </span>
                )}
                {selected &&
                  canEdit &&
                  !addMode &&
                  // На телефоне угловых маркеров нет вовсе: их размер (12 px)
                  // меньше тач-таргета, а ресайз за угол пальцем всё равно
                  // недоступен — правка идёт через координаты в карточке.
                  drawEnabled &&
                  CORNERS.map((corner) => (
                    <span
                      key={corner}
                      role="presentation"
                      aria-hidden="true"
                      data-testid="room-resize-handle"
                      onPointerDown={(event) =>
                        handleResizePointerDown(event, room.id, corner, rect)
                      }
                      className={[
                        // Планшет 768–1023: маркер крупнее (14 px ≈ h-3.5) — на нём
                        // рисование и ресайз остаются доступными, и требование
                        // «маркер ≥12 px» (floor_plan.md) закрывается диапазоном.
                        // Desktop (lg:) сохраняет прежние 8 px.
                        'absolute h-3 w-3 rounded-sm border border-primary-600 bg-white',
                        'md:max-lg:h-3.5 md:max-lg:w-3.5 lg:h-2 lg:w-2',
                        CORNER_CLASS[corner],
                      ].join(' ')}
                    />
                  ))}
              </div>
            );
          })}

          {preview && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-primary-600 bg-primary-50"
              style={{
                left: preview.x * zoom,
                top: preview.y * zoom,
                width: preview.width * zoom,
                height: preview.height * zoom,
              }}
            />
          )}
        </div>
      </div>

      {/* Легенда цветов инвентаря: план читается без подсказок, как табличка на посту. */}
      {rooms.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/90 px-2.5 py-1.5 shadow-sm">
          <ColorZoneLegend />
          {rooms.some(isLiftZoneRoom) && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-5 rounded-sm border"
                style={{
                  borderColor: COLOR_ZONE_META.BLUE.hex,
                  backgroundColor: `${COLOR_ZONE_META.BLUE.hex}33`,
                  backgroundImage: liftHatchImage(COLOR_ZONE_META.BLUE.hex),
                }}
              />
              Лифтовая зона
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        {addMode && canEdit && (
          <span className="rounded-md bg-neutral-900 px-3 py-1 text-xs text-neutral-100">
            Протяните рамку, чтобы создать помещение
          </span>
        )}
        {highlightedRoomIds !== null && (
          <span
            data-testid="plan-highlight-count"
            className="rounded-md bg-white px-3 py-1 text-xs text-neutral-700 shadow-sm"
          >
            Подсвечено на плане: {highlightedOnPlan} из {highlightedRoomIds.size}
            {highlightedOnPlan < highlightedRoomIds.size && ', у остальных нет координат'}
          </span>
        )}
        {withoutCoords > 0 && (
          <span className="rounded-md bg-white px-3 py-1 text-xs text-warning-600 shadow-sm">
            Помещений без координат на плане: {withoutCoords}
          </span>
        )}
        {uploading && (
          <span className="flex items-center gap-2 rounded-md bg-white px-3 py-1 text-xs text-neutral-500 shadow-sm">
            <Spinner />
            Загрузка плана…
          </span>
        )}
      </div>
    </div>
  );
}
