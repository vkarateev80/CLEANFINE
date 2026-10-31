import JSZip from 'jszip';

/**
 * Разбор Sweet Home 3D (.sh3d) в плоскую 2D-сцену для поэтажного плана.
 *
 * .sh3d — zip-архив: внутри `Home.xml` (сцена) и OBJ-модели (не нужны — план
 * рисуется по стенам и контурам помещений). Единицы координат сцены — сантиметры,
 * ось Y направлена ВНИЗ, как на экране (план Sweet Home 3D — вид сверху в
 * экранных координатах), поэтому layout переносит координаты без переворота.
 *
 * Свойства помещения (13.10.2026): «Планировщик 3D» пишет у `<room>` дочерние
 * `<property name='…' value='…'/>` — стандарт Sweet Home 3D для свойств объекта.
 * Читаются `roomType` (тип помещения, как в пресетах «Виды помещения») и
 * `heightCm` (высота этажа); остальные (`areaM2`, `perimeterM`, `cleanZone`, …)
 * игнорируются: площадь считается по контуру, зона выводится из типа.
 *
 * Многоуровневые сцены складываются в один вид сверху: в экосистеме план —
 * одна картинка на этаж, а уровни SH3D часто служат служебными (размерные),
 * как «Уровень 1-Dim» в боевых файлах. Стены берутся со всех уровней.
 *
 * Номера кабинетов (31.10.2026): в файле это подписи `<label>` с числом, а не
 * имена помещений. Подпись, чья точка лежит внутри контура, даёт помещению
 * `number`; если подписей несколько («401» и «403»), номера идут по возрастанию
 * через «/» — «401/403».
 *
 * Исключение — уровень «Секторы уборки» (31.10.2026, план 4 этажа ЗИЛ): его
 * `<room>` — условные контуры секторов уборки, а не помещения. Они не попадают
 * в `rooms` (иначе импорт создал бы огромные «помещения» поверх этажа) и не
 * расширяют `bounds` (иначе сдвинулся бы масштаб плана); отдаются отдельно в
 * `cleaningSectors`.
 */

/** Имя уровня Sweet Home 3D, на котором лежат контуры секторов уборки. */
export const SECTORS_LEVEL_NAME = 'Секторы уборки';

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
  /** Тип помещения из `<property name='roomType'>` («Планировщик 3D»); в .sh3d нет. */
  type?: string;
  /** Высота этажа, см, из `<property name='heightCm'>`. */
  heightCm?: number;
  /** Номер кабинета из подписи `<label>` внутри контура («407», «401/403»). */
  number?: string;
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
  /** Контуры секторов уборки (уровень «Секторы уборки»): не помещения и не часть `bounds`. */
  cleaningSectors: Sh3dRoom[];
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

/**
 * Свойства `<property name value>` помещения → словарь. Пустые имена и
 * значения пропускаются; при повторе имени побеждает последнее.
 */
function roomProperties(element: Element): Map<string, string> {
  const result = new Map<string, string>();
  for (const property of Array.from(element.getElementsByTagName('property'))) {
    const name = (property.getAttribute('name') ?? '').trim();
    const value = (property.getAttribute('value') ?? '').trim();
    if (name !== '' && value !== '') result.set(name, value);
  }
  return result;
}

/** Точка внутри полигона (чётно-нечётное правило). */
function pointInPolygon(point: Sh3dPoint, polygon: Sh3dPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Номер кабинета в подписи: 2–4 цифры, без слов. */
const ROOM_NUMBER_LABEL = /^\d{2,4}$/;

/**
 * Подписи-номера → `number` помещений. Подпись относится к самому малому
 * контуру, внутри которого лежит её точка; вне контуров она пропускается.
 */
function assignRoomNumbers(document: Document, rooms: Sh3dRoom[]): void {
  const numbers = new Map<Sh3dRoom, string[]>();
  for (const label of Array.from(document.getElementsByTagName('label'))) {
    const text = (label.getElementsByTagName('text')[0]?.textContent ?? '').trim();
    if (!ROOM_NUMBER_LABEL.test(text)) continue;
    const point = {
      x: parseNumber(label.getAttribute('x'), Number.NaN),
      y: parseNumber(label.getAttribute('y'), Number.NaN),
    };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    let target: Sh3dRoom | undefined;
    for (const room of rooms) {
      if (!pointInPolygon(point, room.points)) continue;
      if (target === undefined || room.areaM2 < target.areaM2) target = room;
    }
    if (target) numbers.set(target, [...(numbers.get(target) ?? []), text]);
  }
  for (const [room, list] of numbers) {
    room.number = [...new Set(list)].sort((a, b) => Number(a) - Number(b)).join('/');
  }
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
  const cleaningSectors: Sh3dRoom[] = [];

  const sectorLevelIds = new Set<string>();
  for (const level of Array.from(document.getElementsByTagName('level'))) {
    const id = level.getAttribute('id');
    if (id && (level.getAttribute('name') ?? '').trim() === SECTORS_LEVEL_NAME) {
      sectorLevelIds.add(id);
    }
  }

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
    const properties = roomProperties(element);
    const type = properties.get('roomType');
    const heightCm = parseNumber(properties.get('heightCm') ?? null, Number.NaN);
    const room: Sh3dRoom = {
      id: element.getAttribute('id') ?? `room-${index}`,
      name: (element.getAttribute('name') ?? '').trim(),
      points,
      areaM2: polygonAreaM2(points),
      ...(type !== undefined ? { type } : {}),
      ...(Number.isFinite(heightCm) && heightCm > 0 ? { heightCm } : {}),
    };
    const level = element.getAttribute('level');
    (level !== null && sectorLevelIds.has(level) ? cleaningSectors : rooms).push(room);
  }

  if (walls.length === 0 && rooms.length === 0) {
    throw new Sh3dParseError('В Home.xml нет ни стен, ни помещений');
  }

  assignRoomNumbers(document, rooms);

  return { walls, rooms, cleaningSectors, bounds: boundsOf(walls, rooms) };
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
