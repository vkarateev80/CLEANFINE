/**
 * Диапазон дат для отчёта/истории движений. Общая логика для контроллера
 * (строки из query) и сервиса (готовые Date) — чтобы правило «до = конец дня»
 * существовало в одном месте.
 */
export interface DateRange {
  from?: Date;
  to?: Date;
}

/** Парсит ISO-строку; невалидное значение → undefined (фильтр не применяется). */
export function parseDate(value?: string | null): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Верхняя граница диапазона. Если время не указано (00:00:00.000), трактуем как
 * «конец суток» — иначе `to=2026-01-31` отсекал бы весь последний день.
 */
export function endOfDayIfMidnight(value?: Date): Date | undefined {
  if (!value) {
    return undefined;
  }
  const isMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;
  if (!isMidnight) {
    return value;
  }
  return new Date(value.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Собирает where-условие Prisma по createdAt из «сырого» диапазона. */
export function rangeFilter(range: DateRange): { gte?: Date; lte?: Date } | undefined {
  const gte = range.from;
  const lte = endOfDayIfMidnight(range.to);
  if (!gte && !lte) {
    return undefined;
  }
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}
