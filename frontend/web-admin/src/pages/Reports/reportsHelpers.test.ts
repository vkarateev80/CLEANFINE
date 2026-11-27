import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  consumedByUnit,
  csvNumber,
  formatConsumedByUnit,
  formatNumber,
} from './reportsHelpers';

describe('CSV отчётов для русского Excel (07.11.2026)', () => {
  it('дробные числа — с десятичной запятой, целые — как есть', () => {
    expect(csvNumber(12.5)).toBe('12,50');
    expect(csvNumber(0.1 + 0.2)).toBe('0,30');
    expect(csvNumber(-3.25)).toBe('-3,25');
    expect(csvNumber(42)).toBe('42');
    expect(csvNumber(Number.NaN)).toBe('');
  });

  it('файл: BOM, «;» между полями, запятая в числах не ломает колонки', () => {
    const csv = buildCsv(
      ['Материал', 'Расход', 'Стоимость, ₽'],
      [
        ['Средство «Блеск»', 12.5, 1043.75],
        ['Салфетки; микрофибра', 30, null],
      ],
    );
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Материал;Расход;"Стоимость, ₽"');
    expect(lines[1]).toBe('Средство «Блеск»;12,50;1043,75');
    expect(lines[2]).toBe('"Салфетки; микрофибра";30;');
    expect(lines[1].split(';')).toHaveLength(3);
  });
});

describe('«Израсходовано» по единицам (07.11.2026)', () => {
  const rows = [
    { unit: 'л', consumedQuantity: 1.2 },
    { unit: 'шт', consumedQuantity: 30 },
    { unit: 'л', consumedQuantity: 0.1 },
    { unit: '', consumedQuantity: 2 },
  ];

  it('литры и штуки не складываются', () => {
    expect(consumedByUnit(rows)).toEqual([
      { unit: 'ед.', quantity: 2 },
      { unit: 'л', quantity: 1.3 },
      { unit: 'шт', quantity: 30 },
    ]);
  });

  it('подпись метрики', () => {
    expect(formatConsumedByUnit(rows)).toBe(
      `${formatNumber(2)} ед. · ${formatNumber(1.3)} л · ${formatNumber(30)} шт`,
    );
    expect(formatConsumedByUnit([])).toBe('0');
  });
});
