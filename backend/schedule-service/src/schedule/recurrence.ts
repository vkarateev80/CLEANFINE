/**
 * Правило повторения графика: чистые функции без Nest/Prisma — их проще тестировать,
 * и вся арифметика даты/времени собрана в одном месте.
 *
 * Соглашения:
 *  - date — календарный день расписания, записанный полночью UTC (ключ дня, а не
 *    момент); time — "HH:mm" по времени расписания. С 18.10.2026 расписание
 *    живёт по Москве: момент начала = день + time − сдвиг пояса
 *    (`utcOffsetMinutes`, по умолчанию SCHEDULE_UTC_OFFSET_MINUTES = 180).
 *    Функции принимают сдвиг параметром (0 — чистый UTC), поэтому остаются
 *    детерминированными в тестах.
 *  - weekly использует ISO-дни: 1 = понедельник … 7 = воскресенье (совпадает
 *    с Пн–Пт [1..5] из устава и с примером в BACKEND_SCHEDULE.md).
 *  - monthly сравнивает день месяца (1..31). Для 31-го числа смены появятся не во всех
 *    месяцах — совпадение по числу месяца и есть правило, «последний день месяца»
 *    в контракте не задан.
 */

import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from '@cleaning-ops/shared/types/schedule';
import type { RecurrenceRule } from '../events/event-payloads';

/**
 * Реэкспорт shared-словаря под историческими именами сервиса: `FREQUENCIES`
 * читают DTO (`@IsIn`) и тесты, переписывать их импорты смысла нет — важно, что
 * значения теперь ровно одни и те же у схемы, валидации и админки.
 * Расхождение с prisma-схемой ловит `schedule-dictionary.spec.ts`.
 */
export const FREQUENCIES = SCHEDULE_FREQUENCIES;
export type Frequency = ScheduleFrequency;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Полночь UTC для "YYYY-MM-DD". Бросает на невалидной строке. */
export function parseDateOnly(value: string): Date {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Некорректная дата: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Отсекаем 2026-02-30: Date молча переносит день в следующий месяц.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Некорректная дата: ${value}`);
  }
  return date;
}

/** "YYYY-MM-DD" из Date (UTC). */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Полночь UTC сегодняшнего дня. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Сегодняшний день расписания: календарная дата момента `now` в поясе со
 * сдвигом `utcOffsetMinutes` (Москва: 00:30 МСК 19-го — это уже 19-е, хотя в UTC
 * ещё 18-е).
 */
export function scheduleToday(now: Date = new Date(), utcOffsetMinutes = 0): Date {
  return todayUtc(new Date(now.getTime() + utcOffsetMinutes * 60_000));
}

/** Минуты из "HH:mm"; null — строка не соответствует формату. */
export function parseTimeOfDay(time: string): number | null {
  const match = TIME_PATTERN.exec(time.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Момент начала смены: день + время графика − сдвиг пояса. 08:00 МСК 19-го
 * (`utcOffsetMinutes` = 180) — это 05:00 UTC 19-го; 01:00 МСК 19-го — 22:00 UTC 18-го.
 */
export function plannedStartAt(date: Date, time: string, utcOffsetMinutes = 0): Date {
  const minutes = parseTimeOfDay(time);
  if (minutes === null) {
    throw new Error(`Некорректное время графика: ${time}`);
  }
  return new Date(date.getTime() + (minutes - utcOffsetMinutes) * 60_000);
}

/** Подпись пояса для текстов: 0 → «UTC», 180 → «МСК», иначе «UTC+5», «UTC−3:30». */
export function utcOffsetLabel(utcOffsetMinutes: number): string {
  if (utcOffsetMinutes === 0) return 'UTC';
  if (utcOffsetMinutes === 180) return 'МСК';
  const sign = utcOffsetMinutes > 0 ? '+' : '−';
  const abs = Math.abs(utcOffsetMinutes);
  const minutes = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

/**
 * Проверяет, попадает ли правило повторения на дату.
 * Невалидное правило (частота/время/дни) → false: график пропускается, генерация не падает.
 */
export function matchesRecurrence(recurrence: RecurrenceRule, date: Date): boolean {
  if (!recurrence || !FREQUENCIES.includes(recurrence.frequency)) {
    return false;
  }
  if (parseTimeOfDay(recurrence.time ?? '') === null) {
    return false;
  }

  switch (recurrence.frequency) {
    case 'daily':
      return true;
    case 'weekly': {
      const days = recurrence.days;
      if (!Array.isArray(days) || days.length === 0) {
        return false;
      }
      return days.includes(isoWeekday(date));
    }
    case 'monthly': {
      const rule = dayOfMonthRule(recurrence);
      // Без явного числа месяца правило неопределимо: молчаливое «каждый день»
      // превратило бы monthly в daily, поэтому такой график пропускается.
      return rule !== null && date.getUTCDate() === rule;
    }
    default:
      return false;
  }
}

/** 1 = понедельник … 7 = воскресенье (ISO-8601). */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay(); // 0 = воскресенье
  return day === 0 ? 7 : day;
}

/**
 * Число месяца для monthly: dayOfMonth, иначе первое значение days (утилита на случай
 * контракта, где месячный график задают через days). null — правило не задано.
 */
function dayOfMonthRule(recurrence: RecurrenceRule): number | null {
  const candidates = [recurrence.dayOfMonth, recurrence.days?.[0]];
  for (const candidate of candidates) {
    const value = Math.trunc(Number(candidate));
    if (Number.isFinite(value) && value >= 1 && value <= 31) {
      return value;
    }
  }
  return null;
}

/**
 * Разбирает recurrence из JSON-колонки Prisma в типизированное правило.
 * null — структура не соответствует контракту (график будет пропущен генерацией).
 */
export function normalizeRecurrence(value: unknown): RecurrenceRule | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const frequency = record.frequency;
  const time = record.time;
  if (typeof frequency !== 'string' || !FREQUENCIES.includes(frequency as Frequency)) {
    return null;
  }
  if (typeof time !== 'string' || parseTimeOfDay(time) === null) {
    return null;
  }
  const days = Array.isArray(record.days)
    ? record.days.map((item) => Math.trunc(Number(item))).filter((item) => Number.isFinite(item))
    : undefined;
  const dayOfMonth =
    record.dayOfMonth === undefined || record.dayOfMonth === null
      ? undefined
      : Number(record.dayOfMonth);
  const durationRaw = record.durationMin;
  const durationMin =
    durationRaw === undefined || durationRaw === null ? undefined : Math.trunc(Number(durationRaw));
  return {
    frequency: frequency as Frequency,
    days,
    dayOfMonth: Number.isFinite(dayOfMonth) ? dayOfMonth : undefined,
    time,
    durationMin:
      durationMin !== undefined && Number.isFinite(durationMin) && durationMin > 0
        ? durationMin
        : undefined,
  };
}
