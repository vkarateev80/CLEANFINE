import JSZip from 'jszip';

/**
 * Разбор Sweet Home 3D (.sh3d) в плоскую 2D-сцену для поэтажного плана.
 *
 * .sh3d — zip-архив: внутри `Home.xml` (сцена) и OBJ-модели (не нужны — план
 * рисуется по стенам и контурам помещений). Единицы координат сцены — сантиметры,
 * ось Y направлена вверх (в отличие от экранных координат; flip делает layout).
 *
 * Многоуровневые сцены складываются в один вид сверху: в экосистеме план —
 * одна картинка на этаж, а уровни SH3D часто служат служебными (размерные),
 * как «Уровень 1-Dim» в боевых файлах. Стены берутся со всех уровней.
 */

export interface Sh3dPoint {
  x: number;
  y: number;
}

export interface Sh3dWall {
  xStart: number;
  yStart: number;
  xEnd: number;
  yEnd: number;
  /** Толщина стены, см. */
  thickness: number;
}

export interface Sh3dRoom {
  id: string;
  name: string;
  /** Контур помещения, см. */
  points: Sh3dPoint[];
  /** Площадь по контуру (формула Шейла), м². */
  areaM2: number;
}

export interface Sh3dBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Sh3dScene {
  walls: Sh3dWall[];
  rooms: Sh3dRoom[];
  bounds: Sh3dBounds;
}

/** Ошибка разбора — UI показывает её текст пользователю как есть. */
export class Sh3dParseError extends Error {}

function parseNumber(value: string | null, fallback: number): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Площадь произвольного полигона (Шейл), см² → м². */
export function polygonAreaM2(points: Sh3dPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2 / 10_000;
}

function boundsOf(walls: Sh3dWall[], rooms: Sh3dRoom[]): Sh3dBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const put = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const wall of walls) {
    put(wall.xStart, wall.yStart);
    put(wall.xEnd, wall.yEnd);
  }
  for (const room of rooms) {
    for (const point of room.points) put(point.x, point.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Разбор `Home.xml`. Чистая функция (без zip) — так её гоняют юнит-тесты.
 */
export function parseHomeXml(xml: string): Sh3dScene {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError) {
    throw new Sh3dParseError('Home.xml не разбирается как XML');
  }

  const walls: Sh3dWall[] = [];
  const rooms: Sh3dRoom[] = [];

  for (const element of Array.from(document.getElementsByTagName('wall'))) {
    walls.push({
      xStart: parseNumber(element.getAttribute('xStart'), 0),
      yStart: parseNumber(element.getAttribute('yStart'), 0),
      xEnd: parseNumber(element.getAttribute('xEnd'), 0),
      yEnd: parseNumber(element.getAttribute('yEnd'), 0),
      thickness: parseNumber(element.getAttribute('thickness'), 10),
    });
  }

  let index = 0;
  for (const element of Array.from(document.getElementsByTagName('room'))) {
    const points: Sh3dPoint[] = [];
    for (const point of Array.from(element.getElementsByTagName('point'))) {
      const x = Number(point.getAttribute('x'));
      const y = Number(point.getAttribute('y'));
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }
    if (points.length < 3) continue; // вырожденный контур — не помещение
    index += 1;
    rooms.push({
      id: element.getAttribute('id') ?? `room-${index}`,
      name: (element.getAttribute('name') ?? '').trim(),
      points,
      areaM2: polygonAreaM2(points),
    });
  }

  if (walls.length === 0 && rooms.length === 0) {
    throw new Sh3dParseError('В Home.xml нет ни стен, ни помещений');
  }

  return { walls, rooms, bounds: boundsOf(walls, rooms) };
}

/** Извлечение `Home.xml` из .sh3d (zip) и разбор сцены. */
export async function readSh3dScene(file: Blob): Promise<Sh3dScene> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Sh3dParseError('Файл не читается как .sh3d (zip-архив)');
  }
  const entry = zip.file('Home.xml');
  if (!entry) {
    throw new Sh3dParseError('В архиве нет Home.xml — это не файл Sweet Home 3D');
  }
  return parseHomeXml(await entry.async('string'));
}

/** Что оказалось внутри .xml: сцена Sweet Home 3D или SVG-чертёж. */
export type PlanXml = { kind: 'home'; scene: Sh3dScene } | { kind: 'svg'; file: File };

/**
 * Разбор отдельного XML-файла плана (12.10.2026). Sweet Home 3D хранит сцену
 * в `Home.xml` внутри .sh3d; некоторые выгружают сам XML — корень `<home>`.
 * SVG — тоже XML (корень `<svg>`): такой файл отдаём как есть, но с правильным
 * типом и расширением, чтобы file-service принял его как image/svg+xml.
 */
export async function readPlanXml(file: File): Promise<PlanXml> {
  const text = await file.text();
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Sh3dParseError('Файл не разбирается как XML');
  }
  const root = document.documentElement?.tagName.toLowerCase() ?? '';
  if (root === 'svg') {
    const name = file.name.replace(/\.xml$/i, '') + '.svg';
    return { kind: 'svg', file: new File([text], name, { type: 'image/svg+xml' }) };
  }
  if (root === 'home') {
    return { kind: 'home', scene: parseHomeXml(text) };
  }
  throw new Sh3dParseError(
    `XML с корнем <${root}> не распознан: ожидается Home.xml из Sweet Home 3D или SVG`,
  );
}

