import type { Sh3dPoint, Sh3dScene } from './parseSh3d';

/**
 * Перевод сцены Sweet Home 3D (см, Y вверх) в пиксели изображения плана
 * (Y вниз). Чистая геометрия без canvas — юнит-тесты гоняют её в jsdom.
 */

/** Желаемая ширина плана; фактическая подгоняется под пропорции и лимиты. */
export const TARGET_PLAN_WIDTH = 2400;
/** жёсткий потолок: canvas и file-service живут спокойно с 4096. */
export const MAX_PLAN_DIMENSION = 4096;
export const PLAN_MARGIN = 40;

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayout {
  id: string;
  name: string;
  areaM2: number;
  /** Контур в пикселях (для отрисовки). */
  polygon: Sh3dPoint[];
  /** Описанная прямоугольник — то, что кладётся в Room.coords*. */
  rect: PxRect;
  /** Точка подписи (центроид полигона). */
  label: { x: number; y: number; fontSize: number };
}

export interface WallLayout {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessPx: number;
}

export interface PlanLayout {
  width: number;
  height: number;
  /** Сколько пикселей в одном сантиметре сцены. */
  pxPerCm: number;
  /** Масштаб плана, метров в одном пикселе (контракт Floor.planScale). */
  scale: number;
  walls: WallLayout[];
  rooms: RoomLayout[];
}

export interface LayoutOptions {
  targetWidth?: number;
  margin?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Размер шрифта подписи: влезает в прямоугольник помещения, но не криклив. */
export function labelFontSize(rect: PxRect, name: string): number {
  if (name === '') return 0;
  // Средняя ширина глифа системного шрифта ≈ 0.56 кегля (кириллица чуть шире).
  const byWidth = rect.width / Math.max(name.length, 1) / 0.56;
  const byHeight = rect.height / 2.8;
  return Math.floor(clamp(Math.min(byWidth, byHeight), 11, 30));
}

/** Описанная прямоугольником область полигона, целыми пикселями, ≥1 px. */
export function boundingRect(polygon: Sh3dPoint[]): PxRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(maxX) - x),
    height: Math.max(1, Math.ceil(maxY) - y),
  };
}

function centroid(polygon: Sh3dPoint[]): Sh3dPoint {
  let x = 0;
  let y = 0;
  for (const point of polygon) {
    x += point.x;
    y += point.y;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

export function layoutPlan(scene: Sh3dScene, options: LayoutOptions = {}): PlanLayout {
  const targetWidth = options.targetWidth ?? TARGET_PLAN_WIDTH;
  const margin = options.margin ?? PLAN_MARGIN;

  const bounds = scene.bounds;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);

  // pxPerCm под ширину, но так, чтобы высота с отступами не перепрыгнула лимит.
  let pxPerCm = targetWidth / spanX;
  const heightAtWidth = spanY * pxPerCm + margin * 2;
  if (heightAtWidth > MAX_PLAN_DIMENSION) {
    pxPerCm = (MAX_PLAN_DIMENSION - margin * 2) / spanY;
  }
  pxPerCm = clamp(pxPerCm, 0.001, 8);

  const width = Math.min(MAX_PLAN_DIMENSION, Math.max(1, Math.ceil(spanX * pxPerCm) + margin * 2));
  const height = Math.min(MAX_PLAN_DIMENSION, Math.max(1, Math.ceil(spanY * pxPerCm) + margin * 2));

  /** См → пиксели, с flip по Y (Y сцены вверх, Y картинки вниз). */
  const toPx = (point: Sh3dPoint): Sh3dPoint => ({
    x: (point.x - bounds.minX) * pxPerCm + margin,
    y: (bounds.maxY - point.y) * pxPerCm + margin,
  });

  const walls: WallLayout[] = scene.walls.map((wall) => {
    const start = toPx({ x: wall.xStart, y: wall.yStart });
    const end = toPx({ x: wall.xEnd, y: wall.yEnd });
    return {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      thicknessPx: Math.max(1, wall.thickness * pxPerCm),
    };
  });

  const scale = 1 / pxPerCm / 100; // см/пкс → м/пкс
  // Площадь прямоугольника в м²: (ширина_пкс · scale) · (высота_пкс · scale).
  // Без второго scale получается px·м — «кадры» на ЗИЛ давали 3090 м² вместо 116.
  const rectAreaM2 = (rect: PxRect): number => rect.width * rect.height * scale * scale;

  const rooms: RoomLayout[] = scene.rooms.map((room) => {
    const polygon = room.points.map(toPx);
    const rect = boundingRect(polygon);
    // Вырожденные контуры не проваливаются в валидацию площади (>0.01 м²):
    // подставляем оценку по описанному прямоугольнику.
    const areaM2 = Math.max(room.areaM2, rectAreaM2(rect), 0.01);
    const center = centroid(polygon);
    return {
      id: room.id,
      name: room.name,
      areaM2,
      polygon,
      rect,
      label: {
        x: center.x,
        y: center.y,
        fontSize: labelFontSize(rect, room.name),
      },
    };
  });

  return { width, height, pxPerCm, scale, walls, rooms };
}
