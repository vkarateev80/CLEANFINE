import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LIBRARY,
  findTemplate,
  templateSummary,
  templatesByCategory,
} from './library';

describe('библиотека шаблонов', () => {
  it('id уникальны и все категории известны', () => {
    const ids = TEMPLATE_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categoryIds = new Set(TEMPLATE_CATEGORIES.map((c) => c.id));
    for (const template of TEMPLATE_LIBRARY) {
      expect(categoryIds.has(template.category)).toBe(true);
    }
  });

  it('в каждой категории есть хотя бы один шаблон', () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(templatesByCategory(category.id).length).toBeGreaterThan(0);
    }
    expect(templatesByCategory('all')).toHaveLength(TEMPLATE_LIBRARY.length);
  });

  it('техкарты: непустые операции с положительным нормативом', () => {
    const cards = templatesByCategory('tech-cards');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(card.operations.length).toBeGreaterThan(0);
      for (const operation of card.operations) {
        expect(operation.name.trim()).not.toBe('');
        expect(operation.estimatedTimeMin).toBeGreaterThan(0);
      }
    }
  });

  it('маршруты: точки с нормативами, объекты — этажность и площадь', () => {
    for (const route of templatesByCategory('routes')) {
      expect(route.points.length).toBeGreaterThan(0);
      for (const point of route.points) {
        expect(point.label.trim()).not.toBe('');
        expect(point.estimatedTimeMin).toBeGreaterThan(0);
      }
    }
    for (const object of templatesByCategory('objects')) {
      expect(object.preset.floorsCount).toBeGreaterThan(0);
      expect(object.preset.totalArea).toBeGreaterThan(0);
      expect(object.clientDefaults.clientName).not.toBe('');
    }
  });

  it('материалы: наборы с валидными позициями', () => {
    const sets = templatesByCategory('materials');
    expect(sets.length).toBeGreaterThanOrEqual(2);
    for (const set of sets) {
      expect(set.items.length).toBeGreaterThan(0);
      for (const item of set.items) {
        expect(item.name.trim()).not.toBe('');
        expect(item.unit.trim()).not.toBe('');
        expect(item.defaultConsumption).toBeGreaterThanOrEqual(0);
        expect(item.minStockThreshold).toBeGreaterThanOrEqual(0);
        expect(item.costPerUnit).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('цветовая кодировка: по одной табличке на цвет, с файлами превью и PDF', () => {
    const signs = templatesByCategory('color-coding');
    expect(signs.map((sign) => sign.zone).sort()).toEqual(['BLUE', 'GREEN', 'RED', 'YELLOW']);
    for (const sign of signs) {
      expect(sign.image).toMatch(/^color-coding\/.+\.jpg$/);
      expect(sign.pdf).toMatch(/^color-coding\/.+\.pdf$/);
      expect(templateSummary(sign)).toContain('PDF для печати');
    }
  });

  it('сводка для карточек считается', () => {
    const card = findTemplate('tc-office');
    expect(card).toBeDefined();
    const summary = templateSummary(card!);
    expect(summary).toEqual(['5 операций', '43 мин']);

    const object = findTemplate('obj-bc');
    expect(templateSummary(object!)).toContain('9 этажей');
  });
});
