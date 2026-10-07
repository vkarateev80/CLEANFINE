import { describe, expect, it } from 'vitest';
import {
  COLOR_ZONES,
  COLOR_ZONE_LABELS,
  COLOR_ZONE_META,
  colorZoneDescription,
  colorZoneFromRoomType,
  colorZoneFromZoneField,
  operationColorZone,
  roomColorZone,
} from '@cleaning-ops/shared/types/color-coding';
import { PRESET_LIBRARIES } from '../templates/presets';

/**
 * Правила цветовой кодировки инвентаря (shared). Те же примеры повторяет
 * `mobile/.../test/core/domain/color_zone_test.dart` — наборы держать синхронно.
 */
describe('цветовая кодировка инвентаря', () => {
  it('тип помещения → цвет: санитарные красные, кухни зелёные, стёкла жёлтые, остальное синее', () => {
    expect(colorZoneFromRoomType('Санузел')).toBe('RED');
    expect(colorZoneFromRoomType('Санитарная зона')).toBe('RED');
    expect(colorZoneFromRoomType('Душевая')).toBe('RED');
    expect(colorZoneFromRoomType('Туалет мужской')).toBe('RED');
    expect(colorZoneFromRoomType('Кухня')).toBe('GREEN');
    expect(colorZoneFromRoomType('Столовая')).toBe('GREEN');
    expect(colorZoneFromRoomType('Зона приёма пищи')).toBe('GREEN');
    expect(colorZoneFromRoomType('Витрина')).toBe('YELLOW');
    expect(colorZoneFromRoomType('Остекление фасада')).toBe('YELLOW');
    expect(colorZoneFromRoomType('Офис')).toBe('BLUE');
    expect(colorZoneFromRoomType('Коридор')).toBe('BLUE');
    expect(colorZoneFromRoomType('Холл')).toBe('BLUE');
    expect(colorZoneFromRoomType('Переговорная')).toBe('BLUE');
    expect(colorZoneFromRoomType('Керамическая плитка')).toBe('BLUE');
    expect(colorZoneFromRoomType('')).toBe('BLUE');
    expect(colorZoneFromRoomType(null)).toBe('BLUE');
  });

  it('регистр и буква ё не влияют', () => {
    expect(colorZoneFromRoomType('САНУЗЕЛ')).toBe('RED');
    expect(colorZoneFromRoomType('зона приема пищи')).toBe('GREEN');
    expect(colorZoneFromZoneField('ЖЕЛТАЯ ЗОНА')).toBe('YELLOW');
  });

  it('поле «Зона» задаёт цвет явно и важнее типа', () => {
    expect(colorZoneFromZoneField('Красная зона')).toBe('RED');
    expect(colorZoneFromZoneField('синяя')).toBe('BLUE');
    expect(colorZoneFromZoneField('Зелёная зона')).toBe('GREEN');
    expect(colorZoneFromZoneField('Жёлтая зона')).toBe('YELLOW');
    expect(colorZoneFromZoneField('Зона A')).toBeNull();
    expect(colorZoneFromZoneField('Публичная')).toBeNull();
    expect(colorZoneFromZoneField(null)).toBeNull();
    expect(colorZoneFromZoneField('')).toBeNull();

    expect(roomColorZone({ floorType: 'Офис', zone: 'Красная зона' })).toBe('RED');
    expect(roomColorZone({ floorType: 'Санузел', zone: 'Зона A' })).toBe('RED');
    expect(roomColorZone({ floorType: 'Кухня', zone: null })).toBe('GREEN');
    expect(roomColorZone({ floorType: 'Кабинет' })).toBe('BLUE');
  });

  it('название помещения — запасная подсказка, когда тип типовой', () => {
    // Импорт плана .sh3d ставит всем помещениям тип «Офис», имена при этом настоящие.
    expect(roomColorZone({ floorType: 'Офис', name: 'Кухня ГД' })).toBe('GREEN');
    expect(roomColorZone({ floorType: 'Офис', name: 'Туалет 2 эт.' })).toBe('RED');
    expect(roomColorZone({ floorType: 'Офис', name: 'Переговорка' })).toBe('BLUE');
    // Тип важнее названия: «Санузел» с именем «Кухня» — всё равно красный.
    expect(roomColorZone({ floorType: 'Санузел', name: 'Кухня' })).toBe('RED');
    // Явная зона важнее всего.
    expect(roomColorZone({ floorType: 'Офис', name: 'Кухня ГД', zone: 'Синяя зона' })).toBe('BLUE');
  });

  it('операция со стёклами — всегда жёлтый инвентарь, остальные наследуют цвет помещения', () => {
    expect(operationColorZone('Помыть стекло', 'RED')).toBe('YELLOW');
    expect(operationColorZone('Протереть зеркала', 'BLUE')).toBe('YELLOW');
    expect(operationColorZone('Вымыть окна', 'GREEN')).toBe('YELLOW');
    expect(operationColorZone('Помыть пол', 'RED')).toBe('RED');
    expect(operationColorZone('Вынести мусор', 'GREEN')).toBe('GREEN');
  });

  it('метаданные полные, пресеты зон покрывают все четыре цвета', () => {
    for (const zone of COLOR_ZONES) {
      const meta = COLOR_ZONE_META[zone];
      expect(meta.id).toBe(zone);
      expect(meta.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(meta.tools.length).toBeGreaterThanOrEqual(4);
      expect(colorZoneDescription(zone)).toContain(meta.name);
      // Пресет «Зона» формы помещения распознаётся как явный цвет.
      expect(PRESET_LIBRARIES.zones.values).toContain(COLOR_ZONE_LABELS[zone]);
      expect(colorZoneFromZoneField(COLOR_ZONE_LABELS[zone])).toBe(zone);
    }
  });
});
