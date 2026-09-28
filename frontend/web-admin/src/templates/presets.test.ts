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
    ] as PresetId[]) {
      expect(PRESET_LIBRARIES[id]).toBeDefined();
    }
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
