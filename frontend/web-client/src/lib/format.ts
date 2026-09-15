/**
 * Форматирование дат и чисел портала.
 *
 * Правила DS-004 (`overview.md` п. 7.6): даты `dd.MM.yyyy`, время `HH:mm`,
 * числа и суммы — моноширинным шрифтом (`font-mono` задаётся в разметке).
 *
 * Почему везде строковые операции, а не `new Date(...)`: сервисы отдают время в
 * UTC (`ScheduleEventEntity.plannedStart`, `createdAt`), а админка показывает его
 * «как есть». Если бы портал переводил ISO в локальную зону браузера, цифры
 * портала и админки разошлись бы у одного и того же события (открытый вопрос
 * design/screens/web-client/reports.md п. 10.5). Поэтому время берём прямо из
 * строки, как `utcTimeOf` в web-admin.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Дата ISO/`YYYY-MM-DD` → `dd.MM.yyyy`. Неразобранное значение возвращается как есть. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
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

/** Время из ISO-строки → `HH:mm` (UTC, «как есть»). */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : '—';
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

/** Сегодняшние сутки в UTC — тем же правилом, что `todayUtc()` в контракте смен. */
export function todayUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
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
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  })
    .format(value)
    // Intl в русской локали ставит неразрывный пробел; для mono-подписи удобнее узкий.
    .replace(/\u00A0/g, '\u202F');
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
