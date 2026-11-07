/**
 * Форматирование дат и чисел портала.
 *
 * Правила DS-004 (`overview.md` п. 7.6): даты `dd.MM.yyyy`, время `HH:mm`,
 * числа и суммы — моноширинным шрифтом (`font-mono` задаётся в разметке).
 *
 * Время и дата моментов (ISO с временем) — в часовом поясе организации
 * (настройка schedule-service, 18.10.2026): так же показывает админка. Не
 * локальная зона браузера — иначе цифры портала и админки разошлись бы у одного
 * события (design/screens/web-client/reports.md п. 10.5). Даты без времени
 * (`YYYY-MM-DD`, день смены) уже в поясе организации и разбираются строкой.
 */

import {
  scheduleDateOf,
  scheduleDayLabelOf,
  scheduleTimeOf,
} from '@cleaning-ops/shared/types/time-zone';
import { currentTimeZone } from '../stores/timeZoneStore';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Дата ISO/`YYYY-MM-DD` → `dd.MM.yyyy`. Неразобранное значение возвращается как есть. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length > 10) {
    const label = scheduleDayLabelOf(value, currentTimeZone());
    if (label) return label;
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

/** Дата → `dd.MM` (компактно для карточек заявок и смен). */
export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = formatDate(value).split('.');
  return parts.length === 3 ? `${parts[0]}.${parts[1]}` : formatDate(value);
}

/** Время из ISO-строки → `HH:mm` в поясе организации. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return scheduleTimeOf(value, currentTimeZone()) || '—';
}

/** Дата + время → `dd.MM HH:mm` (компактно: ближайшие смены, карточки заявок). */
export function formatDateTimeShort(value: string | null | undefined): string {
  if (!value) return '—';
  return `${formatDateShort(value)} ${formatTime(value)}`;
}

/** Дата + время → `dd.MM.yyyy HH:mm` (развёрнуто: подписи периодов). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** Сегодняшний день расписания в поясе организации — тем же правилом, что `scheduleToday()` сервиса смен. */
export function scheduleToday(): string {
  return scheduleDateOf(new Date(), currentTimeZone());
}

/** `YYYY-MM-DD` из локальной даты браузера — для `<input type="date">` периодов отчёта. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Первое число текущего месяца в локальной зоне — период отчёта по умолчанию. */
export function firstDayOfMonth(date: Date = new Date()): string {
  return toDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** Разница в днях между двумя `YYYY-MM-DD` (включительно: тот же день = 1). */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** Разделитель разрядов узким пробелом: `12 400`. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: true,
    })
      .format(value)
      // Intl в русской локали ставит неразрывный пробел; для mono-подписи удобнее узкий.
      .replace(/\u00A0/g, '\u202F')
  );
}

/** Сумма с валютой: `1 240,50 ₽`. */
export function formatMoney(value: number): string {
  return `${formatNumber(value, 2)} ₽`;
}

/** Множественное число: 3 «комментария», 5 «комментариев». */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Короткий номер заявки: человекочитаемого номера в схеме нет (первые 8 символов UUID). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Расход по единицам (07.11.2026): литры и штуки не складываются — «Итого» по
 * материалам показывает сумму для каждой единицы: `1,30 л · 30,00 шт`.
 */
export function formatConsumedByUnit(
  rows: ReadonlyArray<{ unit: string; consumedQuantity: number }>,
): string {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const unit = row.unit.trim() || 'ед.';
    sums.set(unit, (sums.get(unit) ?? 0) + row.consumedQuantity);
  }
  if (sums.size === 0) return formatNumber(0, 2);
  return [...sums.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'ru'))
    .map(([unit, quantity]) => `${formatNumber(quantity, 2)} ${unit}`)
    .join(' · ');
}
