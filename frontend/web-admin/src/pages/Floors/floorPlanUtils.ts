import { errorMessage } from '../../components/ui';
import type { RoomEntity, RoomWithTechCard } from '../../types/core';

/**
 * Геометрия плана, форматирование экспликации и проверки файла плана.
 * Чистые функции: их использует и canvas, и формы, и левая панель.
 */

/** Лимит повторяет file-service и `FileInterceptor` core-service. */
export const PLAN_MAX_BYTES = 10 * 1024 * 1024;

export const PLAN_ACCEPT =
  '.png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf';

export const PLAN_FORMATS_HINT = 'PNG, JPG, SVG или PDF, не более 10 МБ';

const PLAN_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.pdf'];
const PLAN_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];

/** Пределы зума из спецификации: 25–400 %, шаг кнопок — 25 %. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.25;

/** Размер помещения по умолчанию при клике по плану (пиксели изображения). */
export const DEFAULT_ROOM_WIDTH = 120;
export const DEFAULT_ROOM_HEIGHT = 80;

/** Меньшая протяжка считается кликом, а не рисованием рамки. */
export const MIN_DRAW_SIZE = 8;

export interface PlanSize {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/** Проверка файла до отправки: те же правила, что у file-service. */
export function planFileError(file: File): string | null {
  const name = file.name.toLowerCase();
  const extensionOk = PLAN_EXTENSIONS.some((extension) => name.endsWith(extension));
  const mimeOk = file.type !== '' && PLAN_MIME_TYPES.includes(file.type);
  if (!extensionOk && !mimeOk) {
    return `Недопустимый формат файла. ${PLAN_FORMATS_HINT}`;
  }
  if (file.size > PLAN_MAX_BYTES) {
    return 'Файл больше 10 МБ';
  }
  return null;
}

/** PDF рисуется не как изображение: браузер показывает его встроенным просмотрщиком. */
export function isPdfPlanUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.pdf($|[?#])/i.test(url);
}

export function formatArea(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU');
}

export function formatRoomCoords(room: RoomEntity): string {
  const rect = roomRect(room);
  if (!rect) return 'координаты не заданы';
  return `x ${rect.x} · y ${rect.y} · ${rect.width}×${rect.height} px`;
}

export function roomRect(room: RoomEntity): Rect | null {
  const { coordsX, coordsY, coordsWidth, coordsHeight } = room;
  if (coordsX === null || coordsY === null || coordsWidth === null || coordsHeight === null) {
    return null;
  }
  return { x: coordsX, y: coordsY, width: coordsWidth, height: coordsHeight };
}

export function hasRect(room: RoomEntity): boolean {
  return roomRect(room) !== null;
}

/** Прямоугольник по двум точкам протяжки — с положительными сторонами. */
export function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.abs(end.x - start.x)),
    height: Math.round(Math.abs(end.y - start.y)),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Рамка по умолчанию: клик задаёт левый верхний угол, размер — разумный. */
export function defaultRectAt(point: { x: number; y: number }, plan: PlanSize): Rect {
  const width = Math.max(1, Math.min(DEFAULT_ROOM_WIDTH, plan.width));
  const height = Math.max(1, Math.min(DEFAULT_ROOM_HEIGHT, plan.height));
  return {
    x: clamp(Math.round(point.x), 0, Math.max(0, plan.width - width)),
    y: clamp(Math.round(point.y), 0, Math.max(0, plan.height - height)),
    width,
    height,
  };
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Сдвиг рамки целиком: она не выходит за пределы изображения. */
export function moveRect(origin: Rect, dx: number, dy: number, plan: PlanSize): Rect {
  return {
    x: clamp(Math.round(origin.x + dx), 0, Math.max(0, plan.width - origin.width)),
    y: clamp(Math.round(origin.y + dy), 0, Math.max(0, plan.height - origin.height)),
    width: origin.width,
    height: origin.height,
  };
}

/** Растягивание за угол: противоположный угол остаётся на месте. */
export function resizeRect(origin: Rect, corner: Corner, point: Point, plan: PlanSize): Rect {
  const isLeft = corner === 'nw' || corner === 'sw';
  const isTop = corner === 'nw' || corner === 'ne';
  const anchorX = isLeft ? origin.x + origin.width : origin.x;
  const anchorY = isTop ? origin.y + origin.height : origin.y;
  const px = clamp(Math.round(point.x), 0, plan.width);
  const py = clamp(Math.round(point.y), 0, plan.height);

  let x = anchorX;
  let width = origin.width;
  if (isLeft) {
    x = clamp(px, 0, Math.max(0, anchorX - MIN_DRAW_SIZE));
    width = anchorX - x;
  } else {
    width = clamp(px, Math.min(plan.width, anchorX + MIN_DRAW_SIZE), plan.width) - anchorX;
  }

  let y = anchorY;
  let height = origin.height;
  if (isTop) {
    y = clamp(py, 0, Math.max(0, anchorY - MIN_DRAW_SIZE));
    height = anchorY - y;
  } else {
    height = clamp(py, Math.min(plan.height, anchorY + MIN_DRAW_SIZE), plan.height) - anchorY;
  }

  return { x, y, width, height };
}

/** Площадь по геометрии — только подсказка в форме, не источник истины. */
export function rectAreaHint(rect: Rect | null, planScale: number | null): number | null {
  if (!rect || planScale === null || planScale <= 0) return null;
  return rect.width * rect.height * planScale * planScale;
}

/**
 * Бэкенд отвечает 400 и на «площадь ≤ 0», и на координаты вне плана.
 * Различаем по тексту, чтобы подсветить именно поля координат.
 */
export function isCoordsError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== 400) return false;
  return /координ|област|границ|размеры плана|Нельзя задать/i.test(errorMessage(error));
}

export type RoomSort = 'order' | 'area' | 'name';

export const ROOM_SORT_OPTIONS: Array<{ value: RoomSort; label: string }> = [
  { value: 'order', label: 'По порядку добавления' },
  { value: 'area', label: 'По площади' },
  { value: 'name', label: 'По названию' },
];

export interface RoomFilter {
  search: string;
  zone: string;
  floorType: string;
  sort: RoomSort;
}

export function filterAndSortRooms(
  rooms: RoomWithTechCard[],
  filter: RoomFilter,
): RoomWithTechCard[] {
  const search = filter.search.trim().toLowerCase();
  const result = rooms.filter((room) => {
    if (search && !room.name.toLowerCase().includes(search)) return false;
    if (filter.zone && (room.zone ?? '') !== filter.zone) return false;
    if (filter.floorType && room.floorType !== filter.floorType) return false;
    return true;
  });

  if (filter.sort === 'area') {
    result.sort((a, b) => b.areaM2 - a.areaM2);
  } else if (filter.sort === 'name') {
    result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  } else {
    result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return result;
}

export function distinctRoomValues(rooms: RoomWithTechCard[], key: 'zone' | 'floorType'): string[] {
  const values = new Set<string>();
  rooms.forEach((room) => {
    const value = key === 'zone' ? room.zone : room.floorType;
    if (value) values.add(value);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Нумерация помещений одна для списка и для подписей на плане. */
export function roomNumbers(rooms: RoomEntity[]): Map<string, number> {
  return new Map(rooms.map((room, index) => [room.id, index + 1]));
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function fileSafe(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned === '' ? 'план' : cleaned;
}

/** Экспорт экспликации клиентом: серверного отчёта по помещениям нет. */
export function downloadRoomsCsv(
  objectName: string,
  floorName: string,
  rooms: RoomWithTechCard[],
): void {
  const header = [
    '№',
    'Название',
    'Площадь, м²',
    'Тип',
    'Зона',
    'Техкарта',
    'X',
    'Y',
    'Ширина',
    'Высота',
  ];
  const rows = rooms.map((room, index) => [
    String(index + 1),
    room.name,
    formatArea(room.areaM2),
    room.floorType,
    room.zone ?? '',
    room.techCard?.name ?? '',
    room.coordsX === null ? '' : String(room.coordsX),
    room.coordsY === null ? '' : String(room.coordsY),
    room.coordsWidth === null ? '' : String(room.coordsWidth),
    room.coordsHeight === null ? '' : String(room.coordsHeight),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');

  // BOM — иначе Excel открывает русский CSV в кодировке DOS.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `экспликация_${fileSafe(objectName)}_${fileSafe(floorName)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
