import { scheduleDateOf } from '@cleaning-ops/shared/types/time-zone';
import { currentTimeZone } from '../stores/timeZoneStore';
import { t } from '../i18n';
/**
 * Даты рабочего места. Время смен и отметок показываем ЛОКАЛЬНО (оператор
 * смотрит на часы телефона: «Смена открыта в 08:04»), а день смены для
 * `GET /schedule/my?from&to` — в поясе расписания организации (настройка
 * schedule-service, 18.10.2026; до этого день был UTC, overview.md п. 7.8).
 */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO → `HH:mm` в локальной зоне. */
export function localTime(value: string | null | undefined): string {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `HH:mm–HH:mm`; без конца — `HH:mm–…`. */
export function timeRange(start: string, end: string | null | undefined): string {
  return `${localTime(start)}–${end ? localTime(end) : '…'}`;
}

/** Сегодняшний день расписания `YYYY-MM-DD` в поясе организации — тем же правилом, что сервер смен. */
export function scheduleToday(now = new Date(), timeZone = currentTimeZone()): string {
  return scheduleDateOf(now, timeZone);
}

/** Предыдущий день для `YYYY-MM-DD` (строкой, без сдвига зоны). */
export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** «ср, 17 сентября» — подзаголовок главного экрана (home_today.md §3.1). */
export function humanDate(now = new Date()): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

/** `dd.MM.yyyy`. */
export function localDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** `mm:ss` для таймера операции (checklist.md §3.3). */
export function mmss(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${pad(minutes)}:${pad(seconds % 60)}`;
}

/** Время сообщения в списке чатов: сегодня — `HH:mm`, вчера — «Вчера», иначе `dd.MM`. */
export function relativeDay(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, now)) return localTime(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t('Вчера');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

/** Множественное число: 3 «помещения», 5 «помещений». */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
