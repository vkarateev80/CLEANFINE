/**
 * Локальные помощники экрана «Карта». Общие компоненты и API лежат вне этого
 * каталога и не правятся, поэтому форматирование и разбор координат живут здесь.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Москва: центр карты, когда объект ещё не выбран и координаты не заданы вручную. */
export const DEFAULT_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };

/** Пределы широты/долготы — те же, что проверяет DTO gps-service (`IsLatitude`/`IsLongitude`). */
export const LAT_RANGE = { min: -90, max: 90 } as const;
export const LNG_RANGE = { min: -180, max: 180 } as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Точность six знаков — как координаты в паспорте объекта (DS-003). */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

/**
 * Координаты из строки поля ввода. Точка — единственный десятичный разделитель,
 * который принимает бэкенд; запятую из русской раскладки заменяем, чтобы
 * «55,7558» не превращалось в NaN.
 */
export function parseCoordinate(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, min, max);
}

/**
 * Расстояние: до километра — метры, дальше — километры с одним знаком.
 * `null` приходит, когда PostGIS не смог посчитать расстояние (нет геометрии).
 */
export function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} км`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `dd.MM.yyyy HH:mm` — тот же формат, что на экранах объектов и заявок. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Первые 8 символов UUID — как «Связи» в списке заявок: полный id в таблице не читается. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

/** Окно истории трека: сутки — баланс между «видно смену» и размером ответа. */
export const TRACK_WINDOW_HOURS = 24;

/** Верхняя граница `limit` у бэкенда — 10 000; больше просить бессмысленно. */
export const TRACK_LIMIT = 1000;
