import { describe, expect, it } from 'vitest';
import { PRESET_LIBRARIES, presetValues, type PresetId } from './presets';

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
