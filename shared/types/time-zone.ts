/**
 * Часовой пояс расписания (решение владельца 18.10.2026): время начала в графике,
 * день смены, «сегодня» и подписи времени считаются в одном поясе организации.
 * Пояс выбирает ADMIN в админке («Настройки» → «Часовой пояс»), хранит его
 * schedule-service (`GET/PATCH /api/schedule/settings`), а клиенты получают оттуда.
 *
 * Пояс — IANA-имя (`Europe/Moscow`), арифметика — через `Intl` (есть и в Node, и в
 * браузерах), поэтому переходы на летнее время в других странах считаются верно.
 */

/** Пояс до первой настройки и при недоступной настройке. */
export const DEFAULT_SCHEDULE_TIME_ZONE = 'Europe/Moscow';

export interface ScheduleTimeZoneOption {
  /** IANA-имя пояса. */
  id: string;
  /** Город/регион для списка выбора. */
  label: string;
}

/**
 * Пояса, которые предлагает админка: часовые зоны России от запада к востоку и
 * страны, откуда приезжают операторы. Сервер примет и любой другой валидный
 * IANA-пояс — список только для удобства выбора.
 */
export const SCHEDULE_TIME_ZONES: readonly ScheduleTimeZoneOption[] = [
  { id: 'Europe/Kaliningrad', label: 'Калининград' },
  { id: 'Europe/Moscow', label: 'Москва, Санкт-Петербург' },
  { id: 'Europe/Samara', label: 'Самара, Ижевск' },
  { id: 'Asia/Yekaterinburg', label: 'Екатеринбург, Пермь, Тюмень' },
  { id: 'Asia/Omsk', label: 'Омск' },
  { id: 'Asia/Novosibirsk', label: 'Новосибирск, Барнаул, Томск' },
  { id: 'Asia/Krasnoyarsk', label: 'Красноярск, Кемерово' },
  { id: 'Asia/Irkutsk', label: 'Иркутск, Улан-Удэ' },
  { id: 'Asia/Yakutsk', label: 'Якутск, Чита' },
  { id: 'Asia/Vladivostok', label: 'Владивосток, Хабаровск' },
  { id: 'Asia/Magadan', label: 'Магадан, Южно-Сахалинск' },
  { id: 'Asia/Kamchatka', label: 'Петропавловск-Камчатский' },
  { id: 'Europe/Minsk', label: 'Минск' },
  { id: 'Asia/Bishkek', label: 'Бишкек' },
  { id: 'Asia/Tashkent', label: 'Ташкент' },
  { id: 'Asia/Almaty', label: 'Алматы, Астана' },
  { id: 'Asia/Dushanbe', label: 'Душанбе' },
  { id: 'UTC', label: 'UTC (всемирное время)' },
];

/** Пояс понятен `Intl` (опечатка в имени → false). */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** «Часы на стене» момента в поясе. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function zonedParts(value: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Старые движки отдают полночь как «24» даже при h23.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Сдвиг пояса от UTC в момент `at`, мин (Москва — 180, Бишкек — 360). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const p = zonedParts(at, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instant = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((wall - instant) / 60_000);
}

/** «UTC+3», «UTC−3:30», «UTC». */
export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** Подпись рядом со временем: «МСК» для Москвы, иначе «UTC+6». */
export function timeZoneShortLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === 'Europe/Moscow') return 'МСК';
  return formatUtcOffset(timeZoneOffsetMinutes(timeZone, at));
}

/** «Москва, Санкт-Петербург (UTC+3)»; пояс не из списка — его IANA-имя. */
export function timeZoneTitle(timeZone: string, at: Date = new Date()): string {
  const option = SCHEDULE_TIME_ZONES.find((item) => item.id === timeZone);
  const offset = formatUtcOffset(timeZoneOffsetMinutes(timeZone, at));
  if (timeZone === 'UTC') return option?.label ?? 'UTC';
  return `${option?.label ?? timeZone} (${offset})`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** День `YYYY-MM-DD` момента в поясе расписания. */
export function scheduleDateOf(value: Date, timeZone: string): string {
  const p = zonedParts(value, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** `HH:mm` момента в поясе расписания; пустая строка для нечитаемого значения. */
export function scheduleTimeOf(value: string | Date, timeZone: string): string {
  const date = toDate(value);
  if (!date) return '';
  const p = zonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** `dd.MM.yyyy` момента в поясе расписания; пустая строка для нечитаемого значения. */
export function scheduleDayLabelOf(value: string | Date, timeZone: string): string {
  const date = toDate(value);
  if (!date) return '';
  const p = zonedParts(date, timeZone);
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/**
 * Момент по «часам на стене»: день `YYYY-MM-DD` + `HH:mm` в поясе → UTC.
 * Две итерации сдвига: на переходе на летнее время несуществующий час
 * (02:30 при переводе часов вперёд) уезжает вперёд, а не назад.
 */
export function zonedDateTimeToUtc(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const first = wall - timeZoneOffsetMinutes(timeZone, new Date(wall)) * 60_000;
  const second = wall - timeZoneOffsetMinutes(timeZone, new Date(first)) * 60_000;
  return new Date(second);
}

/** Ответ `GET /api/schedule/settings`. */
export interface ScheduleSettingsView {
  timeZone: string;
  /** «Москва, Санкт-Петербург (UTC+3)». */
  timeZoneTitle: string;
  /** «МСК», «UTC+6» — подпись рядом со временем. */
  timeZoneShortLabel: string;
  /** Текущий сдвиг, мин. */
  utcOffsetMinutes: number;
  /** Сегодняшний день расписания `YYYY-MM-DD`. */
  today: string;
  updatedAt: string | null;
  updatedBy: string | null;
}
