import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TicketType } from '@cleaning-ops/shared/types/tickets';
import { TICKET_TYPE_LABELS } from '../../types/tickets';

/**
 * Помощники экрана «Отчёты» (М7.1): форматирование, экспорт CSV, запись фильтров в
 * query-строку. Типы отчётов живут в `types/reports.ts`, данные — в `api/reports.ts`.
 */

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `dd.MM.yyyy` — формат периодов и дат в таблицах. */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** `dd.MM` — подпись оси графика: год в ряду за период избыточен. */
export function formatDayShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

/** День отчёта словами — для заголовков серий и подсказок. */
export function formatDayLong(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** `dd.MM.yyyy HH:mm` — время отметок смены. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Число с разделителями, до трёх знаков: количества материалов дробные. */
export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/** Стоимость: всегда два знака — это деньги. */
export function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Процент с одним знаком; `null` — «нет данных», а не 0 %. */
export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}

/**
 * Минуты в человекочитаемую длительность: `2 ч 30 мин`.
 *
 * Часы и минуты вместо «150 мин»: время цикла и отработанные смены читаются в часах,
 * а дробные часы («2,5 ч») заставляют считать в уме.
 */
export function formatMinutes(value: number | null): string {
  if (value === null || value === undefined) return '—';
  const total = Math.round(value);
  if (total < 60) return `${total} мин`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

/** Подпись типа заявки из словаря заявок — своих названий отчёт не заводит. */
export function ticketTypeLabel(type: string): string {
  return TICKET_TYPE_LABELS[type as TicketType] ?? type;
}

/** Сотрудник: имя из auth-service, иначе короткий id (справочник может быть недоступен). */
export function employeeLabel(userId: string, names: Map<string, string>): string {
  return names.get(userId) ?? `Сотрудник ${userId.slice(0, 8)}`;
}

/** Объект: имя из core-service, иначе короткий id. */
export function objectLabel(objectId: string | null, names: Map<string, string>): string {
  if (!objectId) return '—';
  return names.get(objectId) ?? `Объект ${objectId.slice(0, 8)}`;
}

// ---------------------------------------------------------------------- CSV

/** Значение ячейки CSV: числа — как есть, строки — в кавычках, если содержат разделитель. */
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // Точка как десятичный разделитель: CSV читают Excel и Google Sheets,
    // а русская локаль в файле превратила бы «12,5» в две колонки.
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  const text = value.replace(/\r?\n/g, ' ').trim();
  return /[";,\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV-файл из заголовков и строк.
 *
 * Разделитель — точка с запятой: файл открывают в русской локали Excel, где запятая
 * уже занята десятичным разделителем. BOM (`\uFEFF`) добавлен намеренно — без него
 * Excel читает UTF-8 как ANSI и ломает кириллицу.
 */
export function buildCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(csvCell).join(';')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Имя файла: `расход-материалов-2026-03-01-2026-03-31.csv` (без пробелов и скобок). */
export function csvFileName(prefix: string, from: string, to: string): string {
  const period = [from || 'всё-время', to || 'всё-время'].join('-');
  return `${prefix}-${period}.csv`.replace(/[^\w.\-]+/g, '-');
}

/**
 * Скачивание CSV.
 *
 * `URL.revokeObjectURL` вызывается сразу после `click()`: браузер уже начал скачивание,
 * а ссылка без отзыва удерживала бы данные в памяти до перезагрузки страницы.
 */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------- query-строка

/**
 * Запись фильтров в query-строку с заменой истории.
 *
 * `replace: true` — чтобы каждое изменение фильтра не превращалось в шаг «назад»:
 * со ссылкой на отчёт работают, а не листают историю ввода даты.
 */
export function useParamWriter() {
  const [, setParams] = useSearchParams();

  return useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
}

/**
 * Период по умолчанию — последние 30 дней.
 *
 * План М7.1 не задаёт окно. 30 дней совпадает с окном KPI доски действий: цифры на доске действий и
 * в отчёте, открытом «как есть», должны сходиться, иначе первое же сравнение выглядит
 * как расхождение.
 */
export function defaultPeriod(days = 30): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: toDateOnly(start), to: toDateOnly(today) };
}

/** `YYYY-MM-DD` в UTC — формат, который принимает `@IsISO8601` в DTO отчётов. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
