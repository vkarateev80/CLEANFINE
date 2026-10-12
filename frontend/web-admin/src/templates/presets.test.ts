import { describe, expect, it } from 'vitest';
import { PRESET_LIBRARIES, presetGroups, presetValues, type PresetId } from './presets';

describe('библиотеки пресетов полей', () => {
  it('все группы заполнены, внутри группы нет дублей', () => {
    const ids = Object.keys(PRESET_LIBRARIES) as PresetId[];
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      const { label, values } = PRESET_LIBRARIES[id];
      expect(label.trim()).not.toBe('');
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('обязательные категории для форм присутствуют', () => {
    for (const id of [
      'object-types',
      'room-types',
      'floor-coverings',
      'zones',
      'material-names',
      'material-units',
      'material-suppliers',
      'operation-names',
      'equipment',
    ] as PresetId[]) {
      expect(PRESET_LIBRARIES[id]).toBeDefined();
    }
  });

  it('оборудование задано человеческим форматом, без JSON', () => {
    const equipment = PRESET_LIBRARIES.equipment.values;
    expect(equipment.length).toBeGreaterThanOrEqual(4);
    for (const option of equipment) {
      const value = typeof option === 'string' ? option : option.value;
      // Единственный JSON-путь оставлен для легаси-ввода, не для библиотеки.
      expect(value.startsWith('{')).toBe(false);
      expect(value.includes('"items"')).toBe(false);
    }
    // Подпись отличается от значения у пункта «только СИЗ».
    const ppeOnly = equipment.find((o) => typeof o !== 'string');
    expect(ppeOnly).toEqual({ value: '; перчатки', label: 'перчатки (только СИЗ)' });
  });

  it('виды помещений разбиты по категориям, склейка без дублей, есть «Столовая»', () => {
    const library = PRESET_LIBRARIES['room-types'];
    expect(library.groups).toBeDefined();
    const groups = library.groups ?? [];
    expect(groups.length).toBeGreaterThanOrEqual(6);
    const labels = groups.map((group) => group.label);
    expect(labels).toContain('Санитарные зоны');
    expect(labels).toContain('Пищевые зоны');
    for (const group of groups) {
      expect(group.label.trim()).not.toBe('');
      expect(group.values.length).toBeGreaterThan(0);
    }
    // Плоский список — ровно склейка групп по порядку, без повторов.
    const flat = groups.flatMap((group) => [...group.values]);
    expect(library.values).toEqual(flat);
    expect(new Set(library.values).size).toBe(library.values.length);
    const food = groups.find((group) => group.label === 'Пищевые зоны');
    expect(food?.values).toContain('Столовая');
    expect(library.values).toContain('Столовая');
    expect(library.values).toContain('Офис');
    expect(library.values).toContain('Санузел');
  });

  it('presetGroups: библиотека с категориями — её группы, без категорий — одна группа', () => {
    const groups = presetGroups('room-types', 'floor-coverings');
    expect(groups.slice(0, -1)).toEqual([...(PRESET_LIBRARIES['room-types'].groups ?? [])]);
    expect(groups.at(-1)).toEqual({
      label: 'Виды покрытий',
      values: PRESET_LIBRARIES['floor-coverings'].values,
    });
  });

  it('presetValues склеивает группы и убирает дубли', () => {
    const roomWithCoverings = presetValues('room-types', 'floor-coverings');
    expect(roomWithCoverings).toEqual([
      ...PRESET_LIBRARIES['room-types'].values,
      ...PRESET_LIBRARIES['floor-coverings'].values,
    ]);
    expect(new Set(roomWithCoverings).size).toBe(roomWithCoverings.length);

    const units = presetValues('material-units');
    expect(units).toContain('л');
    expect(units).toContain('шт');
  });
});
