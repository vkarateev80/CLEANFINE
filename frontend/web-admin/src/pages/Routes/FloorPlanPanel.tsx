import { useMemo, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorBanner } from '../../components/ui';
import type { RoomEntity } from '../../types/core';
import { hasCoords, roomCenter } from './helpers';

/**
 * Панель плана этажа: картинка плана + рамки помещений + нумерованные маркеры
 * точек маршрута.
 *
 * Координаты помещений хранятся в пикселях исходного изображения, поэтому
 * маркеры позиционируются абсолютно относительно контейнера, который тянется по
 * картинке (картинка — «распорка»). Масштаб и панорамирование применяются
 * CSS-трансформом к общему контейнеру: и картинка, и маркеры масштабируются
 * одним правилом, без пересчёта координат в состоянии.
 */

export interface FloorPlanPoint {
  id: string;
  room: RoomEntity;
  estimatedTimeMin: string;
}

export interface FloorPlanPanelProps {
  /** Этаж из списка этажей объекта: нужен для `planScale`, которого нет в `RouteDetail`. */
  floor: {
    id: string;
    name: string;
    number: number;
    planImageUrl: string | null;
    planScale: number | null;
  } | null;
  /** Пока список этажей не загружен — подпись и картинка берутся из `RouteDetail.floor`. */
  floorFallback: { id: string; name: string; number: number; planImageUrl: string | null };
  points: FloorPlanPoint[];
  rooms: RoomEntity[];
  selectedPointId: string | null;
  onSelectPoint: (pointId: string) => void;
  onAddRoom: (room: RoomEntity) => void;
  disabled: boolean;
  roomsLoading: boolean;
  roomsError: unknown;
  onRetryRooms: () => void;
  /** Для ссылки «Загрузить план»: экран плана этажа требует объект и этаж. */
  objectId: string | null;
  /** На tablet-ширине маркеров много — показываем первые 20 до нажатия «Показать все». */
  compact: boolean;
  className?: string;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const COMPACT_MARKER_LIMIT = 20;

export function FloorPlanPanel({
  floor,
  floorFallback,
  points,
  rooms,
  selectedPointId,
  onSelectPoint,
  onAddRoom,
  disabled,
  roomsLoading,
  roomsError,
  onRetryRooms,
  objectId,
  compact,
  className,
}: FloorPlanPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panFrom, setPanFrom] = useState<{ x: number; y: number } | null>(null);
  const [showAllMarkers, setShowAllMarkers] = useState(false);

  const activeFloor = floor ?? floorFallback;
  const planImageUrl = activeFloor.planImageUrl;
  const planScale = floor?.planScale ?? null;

  /** Помещения, уже добавленные в маршрут: повторное добавление бэкенд формально
   * разрешает, но очевидный дубль в конструкторе создавать нельзя — строки размножатся. */
  const pointRoomIds = useMemo(() => new Set(points.map((point) => point.room.id)), [points]);

  const numberedMarkers = useMemo(
    () =>
      points.flatMap((point, index) => {
        const center = roomCenter(point.room);
        return center === null ? [] : [{ point, number: index + 1, center }];
      }),
    [points],
  );

  const visibleMarkers =
    compact && !showAllMarkers ? numberedMarkers.slice(0, COMPACT_MARKER_LIMIT) : numberedMarkers;
  const hiddenCount = numberedMarkers.length - visibleMarkers.length;

  const selectedRoomId = points.find((point) => point.id === selectedPointId)?.room.id ?? null;

  function zoomBy(delta: number) {
    setZoom((current) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((current + delta).toFixed(2)))),
    );
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    // Зум только с Ctrl: без модификатора колесо должно прокручивать панель,
    // иначе длинный план невозможно пролистать на тачпаде.
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Панорамирование тянет только фон плана: на маркере и рамке pointerdown
    // принадлежит кнопке, иначе клик «выбрать точку» превращался бы в сдвиг.
    if (event.target !== event.currentTarget) return;
    setPanFrom({ x: event.clientX - pan.x, y: event.clientY - pan.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panFrom) return;
    setPan({ x: event.clientX - panFrom.x, y: event.clientY - panFrom.y });
  }

  function handlePointerUp() {
    setPanFrom(null);
  }

  return (
    <div
      className={[
        'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm',
        className ?? '',
      ].join(' ')}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-neutral-500">
          План этажа
          {activeFloor ? ` — ${activeFloor.number}. ${activeFloor.name}` : ''}
        </h2>
        {planImageUrl !== null && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-neutral-400">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => zoomBy(-0.1)}
              aria-label="Уменьшить масштаб"
            >
              −
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => zoomBy(0.1)}
              aria-label="Увеличить масштаб"
            >
              +
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Сбросить
            </Button>
          </div>
        )}
      </div>

      {planImageUrl === null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <div className="text-sm font-medium text-neutral-500">План этажа не загружен</div>
          <div className="max-w-md text-xs text-neutral-400">
            Маркеры точек строятся по координатам помещений на плане. Загрузите изображение плана,
            чтобы видеть порядок обхода.
          </div>
          {objectId ? (
            <Link to={`/objects/${objectId}/floors/${activeFloor.id}`}>
              <Button variant="secondary" size="sm">
                Загрузить план
              </Button>
            </Link>
          ) : (
            <span className="text-xs text-neutral-400">
              Откройте экран плана этажа через карточку объекта.
            </span>
          )}
        </div>
      ) : (
        <div
          className={[
            'overflow-auto rounded-lg border border-neutral-200 bg-neutral-100',
            panFrom ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
          style={{ maxHeight: '62vh' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="presentation"
        >
          <div
            className="relative inline-block origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <img
              src={planImageUrl}
              alt={`План этажа ${activeFloor.number}`}
              className="block max-w-none select-none"
              draggable={false}
            />

            {rooms.map((room) => {
              if (!hasCoords(room)) return null;
              const selected = room.id === selectedRoomId;
              const inRoute = pointRoomIds.has(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={disabled || inRoute}
                  onClick={() => onAddRoom(room)}
                  title={
                    inRoute
                      ? `${room.name} — уже в маршруте`
                      : `Добавить «${room.name}» в конец маршрута`
                  }
                  aria-label={
                    inRoute
                      ? `Помещение ${room.name} уже в маршруте`
                      : `Добавить помещение ${room.name}`
                  }
                  className={[
                    'absolute rounded-sm border transition-colors',
                    selected
                      ? 'border-2 border-primary-600 bg-primary-50'
                      : 'border-primary-500 bg-white/30 hover:bg-primary-50',
                    disabled || inRoute ? 'cursor-default' : 'cursor-pointer',
                  ].join(' ')}
                  style={{
                    left: room.coordsX ?? 0,
                    top: room.coordsY ?? 0,
                    width: room.coordsWidth ?? 0,
                    height: room.coordsHeight ?? 0,
                  }}
                />
              );
            })}

            {visibleMarkers.map(({ point, number, center }) => {
              const selected = point.id === selectedPointId;
              const withoutTechCard = point.room.techCardId === null;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => onSelectPoint(point.id)}
                  title={`${number}. ${point.room.name}`}
                  aria-label={`Точка ${number}: ${point.room.name}`}
                  aria-pressed={selected}
                  className={[
                    'absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
                    'rounded-full border-2 text-xs font-medium shadow-sm',
                    // Маркер остаётся 24 px (на плане их может быть много, крупные
                    // круги закрыли бы помещения), но зона нажатия на телефоне и
                    // планшете расширяется псевдоэлементом до ~44 px. `relative`
                    // здесь не нужен: кнопка уже `absolute`, то есть служит
                    // содержащим блоком для своего `after`.
                    "max-lg:after:absolute max-lg:after:-inset-2.5 max-lg:after:content-['']",
                    selected
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : withoutTechCard
                        ? 'border-warning-500 bg-white text-warning-600'
                        : 'border-primary-500 bg-white text-primary-700',
                  ].join(' ')}
                  style={{ left: center.x, top: center.y }}
                >
                  {number}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {roomsError !== null && (
        <ErrorBanner error={roomsError} onRetry={onRetryRooms} className="mt-3" />
      )}

      {planImageUrl !== null && roomsLoading && (
        <div className="mt-3 text-xs text-neutral-400">Загрузка помещений этажа…</div>
      )}

      {planImageUrl !== null && !roomsLoading && rooms.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
          На этаже нет помещений — нарисуйте их на плане.
          {objectId && (
            <Link
              to={`/objects/${objectId}/floors/${activeFloor.id}`}
              className="ml-1 text-primary-600 underline"
            >
              Нарисовать помещения на плане
            </Link>
          )}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setShowAllMarkers(true)}>
            Показать все маркеры (+{hiddenCount})
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1">
        {points.length === 0 && (
          <div className="text-xs text-neutral-400">
            В маршруте нет точек — на плане нет маркеров.
          </div>
        )}
        {points.map((point, index) => (
          <button
            key={point.id}
            type="button"
            onClick={() => onSelectPoint(point.id)}
            className={[
              'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
              // Список точек под планом — дублирующий путь выбора точки; на
              // телефоне и планшете строка доводится до тач-таргета 44 px.
              'max-lg:min-h-[44px]',
              point.id === selectedPointId
                ? 'bg-primary-50 text-primary-700'
                : 'text-neutral-500 hover:bg-neutral-50',
            ].join(' ')}
          >
            <span className="font-mono">({index + 1})</span>
            <span className="min-w-0 flex-1 truncate">
              {point.room.name}
              {!hasCoords(point.room) && (
                <span className="ml-1 text-warning-600">нет координат</span>
              )}
            </span>
            <span className="font-mono">
              {point.estimatedTimeMin.trim() === '' ? '—' : point.estimatedTimeMin} мин
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-400">
        {planScale === null
          ? 'Масштаб не задан. Клик по помещению добавляет его в конец маршрута, клик по маркеру выбирает точку.'
          : `Масштаб: ${planScale} м/пкс. Клик по помещению добавляет его в конец маршрута, клик по маркеру выбирает точку. Ctrl+колесо — масштаб, перетаскивание фона — сдвиг.`}
      </div>
    </div>
  );
}
