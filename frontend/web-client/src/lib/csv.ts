/**
 * CSV для Excel в русской локали (`reports.md` п. 7.4): разделитель полей `;`,
 * UTF-8 с BOM — иначе Excel покажет кириллицу кракозябрами.
 *
 * 07.11.2026: числа пишутся с десятичной ЗАПЯТОЙ и без кавычек — «12.5» русский
 * Excel читал как текст (не суммировался, прижат влево).
 */

export type CsvValue = string | number | null;

/** Число с десятичной запятой; целое — как есть. */
export function csvNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return (Number.isInteger(value) ? String(value) : value.toFixed(2)).replace('.', ',');
}

function csvCell(value: CsvValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return csvNumber(value);
  return `"${value.replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(';'), ...rows.map((row) => row.map(csvCell).join(';'))];
  return `﻿${lines.join('\r\n')}`;
}
