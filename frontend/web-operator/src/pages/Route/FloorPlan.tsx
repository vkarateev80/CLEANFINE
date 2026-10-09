import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import type { PointStatus, PointView } from '../../domain/progress';

/**
 * План этажа с маркерами точек маршрута (route_map.md §3.1–3.2).
 *
 * Картинка рисуется в натуральном размере (`planWidth × planHeight`) внутри
 * слоя с CSS-transform: координаты помещений — пиксели этого изображения,
 * поэтому контуры лежат в том же слое и масштабируются вместе с планом.
 * Маркеры — в отдельном немасштабируемом слое: 28 px на экране при любом
 * зуме, позиция считается из текущего transform. Жесты: перетаскивание одним
 * пальцем, pinch двумя, колесо мыши, кнопки «−/+/Сброс/К текущей».
 */
const MARKER_COLOR: Record<PointStatus, string> = {
  pending: 'bg-neutral-400',
  active: 'bg-primary-500',
  done: 'bg-success-500',
  skipped: 'bg-warning-500',
};

const OUTLINE_COLOR: Record<PointStatus, string> = {
  pending: 'rgba(209,213,219,0.9)',
  active: '#3399FF',
  done: '#22C55E',
  skipped: '#F59E0B',
};

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

export interface FloorPlanProps {
  planImageUrl: string;
  planWidth: number;
  planHeight: number;
  views: PointView[];
  onPointTap: (view: PointView) => void;
  onLegend: () => void;
  onImageError: () => void;
}

function markerCenter(view: PointView): { x: number; y: number } | null {
  const { coordsX, coordsY, coordsWidth, coordsHeight } = view.point.room;
  if (coordsX === null || coordsY === null) return null;
  return { x: coordsX + (coordsWidth ?? 0) / 2, y: coordsY + (coordsHeight ?? 0) / 2 };
}

export function FloorPlan({
  planImageUrl,
  planWidth,
  planHeight,
  views,
  onPointTap,
  onLegend,
  onImageError,
}: FloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [loaded, setLoaded] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startDistance: number;
    startScale: number;
    startMid: { x: number; y: number };
    startTx: number;
    startTy: number;
  } | null>(null);
  const moved = useRef(false);

  const fitScale = size.width > 0 ? Math.min(size.width / planWidth, size.height / planHeight) : 1;
  const minScale = fitScale * 0.5;
  const maxScale = Math.max(fitScale * 6, 1.5);

  const fit = useCallback(() => {
    if (size.width === 0) return;
    const scale = fitScale;
    setTransform({
      scale,
      tx: (size.width - planWidth * scale) / 2,
      ty: (size.height - planHeight * scale) / 2,
    });
  }, [fitScale, planHeight, planWidth, size.height, size.width]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Первый расчёт — как только известен размер контейнера.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.width > 0) {
      fitted.current = true;
      fit();
    }
  }, [fit, size.width]);

  const clampScale = (value: number) => Math.min(maxScale, Math.max(minScale, value));

  const zoomAt = useCallback(
    (factor: number, origin?: { x: number; y: number }) => {
      setTransform((current) => {
        const nextScale = clampScale(current.scale * factor);
        const ratio = nextScale / current.scale;
        const ox = origin?.x ?? size.width / 2;
        const oy = origin?.y ?? size.height / 2;
        return {
          scale: nextScale,
          tx: ox - (ox - current.tx) * ratio,
          ty: oy - (oy - current.ty) * ratio,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minScale, maxScale, size.width, size.height],
  );

  const centerOn = useCallback(
    (view: PointView) => {
      const center = markerCenter(view);
      if (!center) return;
      setTransform((current) => ({
        ...current,
        tx: size.width / 2 - center.x * current.scale,
        ty: size.height / 2 - center.y * current.scale,
      }));
    },
    [size.height, size.width],
  );

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const rect = containerRef.current?.getBoundingClientRect();
      gesture.current = {
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: transform.scale,
        startMid: { x: (a.x + b.x) / 2 - (rect?.left ?? 0), y: (a.y + b.y) / 2 - (rect?.top ?? 0) },
        startTx: transform.tx,
        startTy: transform.ty,
      };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const start = gesture.current;
      const scale = clampScale((start.startScale * distance) / Math.max(1, start.startDistance));
      const ratio = scale / start.startScale;
      setTransform({
        scale,
        tx: start.startMid.x - (start.startMid.x - start.startTx) * ratio,
        ty: start.startMid.y - (start.startMid.y - start.startTy) * ratio,
      });
      moved.current = true;
      return;
    }
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setTransform((current) => ({ ...current, tx: current.tx + dx, ty: current.ty + dy }));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }

  const active = views.find((view) => view.status === 'active') ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative h-[48dvh] min-h-[260px] touch-none select-none overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        data-testid="route_map_viewer"
        role="application"
        aria-label="План этажа с точками маршрута"
      >
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            width: planWidth,
            height: planHeight,
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          }}
        >
          <img
            src={planImageUrl}
            width={planWidth}
            height={planHeight}
            alt="План этажа"
            draggable={false}
            className="block max-w-none"
            style={{ width: planWidth, height: planHeight }}
            onLoad={() => setLoaded(true)}
            onError={onImageError}
            data-testid="route_floor_plan_image"
          />
          {views.map((view) => {
            const { coordsX, coordsY, coordsWidth, coordsHeight } = view.point.room;
            if (coordsX === null || coordsY === null || !coordsWidth || !coordsHeight) return null;
            const isActive = view.status === 'active';
            return (
              <div
                key={view.point.id}
                className="absolute"
                style={{
                  left: coordsX,
                  top: coordsY,
                  width: coordsWidth,
                  height: coordsHeight,
                  border: `${Math.max(2, 2 / transform.scale)}px solid ${OUTLINE_COLOR[view.status]}`,
                  backgroundColor: isActive ? 'rgba(51,153,255,0.18)' : 'transparent',
                }}
                data-testid={`route_room_outline_${view.point.room.id}`}
                aria-hidden="true"
              />
            );
          })}
        </div>

        {!loaded && (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500"
            aria-live="polite"
          >
            Загрузка плана…
          </div>
        )}

        {views.map((view) => {
          const center = markerCenter(view);
          if (!center) return null;
          const left = transform.tx + center.x * transform.scale;
          const top = transform.ty + center.y * transform.scale;
          const label = `Точка ${view.point.orderIndex + 1}, ${view.point.room.name}, ${view.status === 'active' ? 'в работе' : view.status === 'done' ? 'выполнено' : view.status === 'skipped' ? 'пропущено' : 'ожидает'}`;
          return (
            <button
              key={view.point.id}
              type="button"
              className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left, top }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onPointTap(view)}
              aria-label={label}
              data-testid={`route_point_marker_${view.point.id}`}
            >
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md',
                  MARKER_COLOR[view.status],
                  view.status === 'active' ? 'op-pulse ring-2 ring-primary-500 ring-offset-1' : '',
                ].join(' ')}
              >
                {view.point.orderIndex + 1}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1" role="toolbar" aria-label="Управление планом">
        <ZoomButton label="Уменьшить" onClick={() => zoomAt(1 / 1.25)} testId="route_zoom_out">
          −
        </ZoomButton>
        <ZoomButton label="Увеличить" onClick={() => zoomAt(1.25)} testId="route_zoom_in">
          ＋
        </ZoomButton>
        <ZoomButton label="Сбросить вид" onClick={fit} testId="route_zoom_reset">
          Сброс
        </ZoomButton>
        <ZoomButton
          label="К текущей точке"
          onClick={() => active && centerOn(active)}
          testId="route_center_button"
          disabled={!active}
        >
          К текущей
        </ZoomButton>
        <span className="flex-1" />
        <ZoomButton label="Легенда" onClick={onLegend} testId="route_legend_button">
          Легенда
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  children,
  label,
  onClick,
  testId,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
