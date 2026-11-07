import { describe, expect, it } from 'vitest';
import { buildCsv, csvNumber } from './csv';
import { formatConsumedByUnit, formatNumber } from './format';

describe('CSV портала для русского Excel (07.11.2026)', () => {
  it('числа — с десятичной запятой и без кавычек, строки — в кавычках', () => {
    const csv = buildCsv(
      ['Материал', 'Израсходовано', 'Стоимость'],
      [['Средство "Блеск"', 1.5, 87.75], ['Салфетки', 30, null]],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('"Материал";"Израсходовано";"Стоимость"');
    expect(lines[1]).toBe('"Средство ""Блеск""";1,50;87,75');
    expect(lines[2]).toBe('"Салфетки";30;');
  });

  it('csvNumber', () => {
    expect(csvNumber(0.1 + 0.2)).toBe('0,30');
    expect(csvNumber(12)).toBe('12');
    expect(csvNumber(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatConsumedByUnit', () => {
  it('литры и штуки — отдельными суммами', () => {
    expect(
      formatConsumedByUnit([
        { unit: 'шт', consumedQuantity: 30 },
        { unit: 'л', consumedQuantity: 1.2 },
        { unit: 'л', consumedQuantity: 0.1 },
      ]),
    ).toBe(`${formatNumber(1.3, 2)} л · ${formatNumber(30, 2)} шт`);
    expect(formatConsumedByUnit([])).toBe(formatNumber(0, 2));
  });
});
