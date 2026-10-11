import { describe, expect, it } from 'vitest';
import {
  COLOR_ZONES,
  COLOR_ZONE_LABELS,
  COLOR_ZONE_META,
  colorZoneDescription,
  colorZoneFromEquipment,
  colorZoneFromRoomType,
  colorZoneFromZoneField,
  equipmentChip,
  operationColorZone,
  operationInventoryZone,
  roomColorZone,
  stripColorWord,
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

  it('слово цвета в оборудовании — прилагательное целым словом', () => {
    expect(colorZoneFromEquipment('синие швабра')).toBe('BLUE');
    expect(colorZoneFromEquipment('Красная швабра')).toBe('RED');
    expect(colorZoneFromEquipment('швабра зелёная')).toBe('GREEN');
    expect(colorZoneFromEquipment('ЖЁЛТЫЕ стеклосгон')).toBe('YELLOW');
    expect(colorZoneFromEquipment('салфетки синего цвета')).toBe('BLUE');
    // Вхождение «син»/«красн» внутри другого слова — не цвет.
    expect(colorZoneFromEquipment('синтетические салфетки')).toBeNull();
    expect(colorZoneFromEquipment('краснодарская губка')).toBeNull();
    expect(colorZoneFromEquipment('ведро')).toBeNull();
    expect(colorZoneFromEquipment('')).toBeNull();
    expect(colorZoneFromEquipment(null)).toBeNull();
    // Цветные наборы пресетов формы операции распознаются все четыре.
    const presetZones = PRESET_LIBRARIES.equipment.values.map((option) =>
      colorZoneFromEquipment(typeof option === 'string' ? option : option.value),
    );
    expect(new Set(presetZones)).toEqual(new Set([...COLOR_ZONES, null]));
  });

  it('с подписи снимается ведущее слово цвета', () => {
    expect(stripColorWord('синие швабра')).toBe('швабра');
    expect(stripColorWord('Синие швабра')).toBe('Швабра');
    expect(stripColorWord('жёлтые: стеклосгон')).toBe('стеклосгон');
    expect(stripColorWord('швабра синяя')).toBe('швабра синяя');
    expect(stripColorWord('синтетические салфетки')).toBe('синтетические салфетки');
    expect(stripColorWord('синие')).toBe('синие');
    expect(stripColorWord('синие   ')).toBe('синие   ');
  });

  it('цвет, названный в оборудовании, — у всего инвентаря операции', () => {
    // Сид техкарты: «синие швабра, ведро…» в санузле — синие все позиции.
    const seeded = ['синие швабра', 'ведро', 'салфетки', 'распылитель', 'перчатки'];
    expect(operationInventoryZone('Протереть рабочие поверхности', seeded, 'RED')).toBe('BLUE');
    // Цвет может стоять не на первой позиции; побеждает первый названный.
    expect(operationInventoryZone('Помыть пол', ['ведро', 'зелёные швабра'], 'RED')).toBe('GREEN');
    expect(
      operationInventoryZone('Помыть пол', ['красные швабра', 'синие салфетки'], 'GREEN'),
    ).toBe('RED');
    // Цвет не назван — прежнее правило: стёкла жёлтые, остальное — цвет помещения.
    expect(operationInventoryZone('Помыть пол', ['швабра', 'ведро'], 'RED')).toBe('RED');
    expect(operationInventoryZone('Протереть зеркала', ['салфетки'], 'RED')).toBe('YELLOW');
    expect(operationInventoryZone('Протереть зеркала', ['жёлтые стеклосгон'], 'RED')).toBe(
      'YELLOW',
    );
    // Явное слово важнее выведенного — и цвета помещения, и правила стёкол.
    expect(operationInventoryZone('Протереть зеркала', ['красные салфетки'], 'BLUE')).toBe('RED');
    // Техкарта на помещения разных цветов (админка): без слова цвета — null.
    expect(operationInventoryZone('Помыть пол', ['швабра'], null)).toBeNull();
    expect(operationInventoryZone('Помыть пол', ['синие швабра'], null)).toBe('BLUE');
    expect(operationInventoryZone('Помыть пол', [], 'GREEN')).toBe('GREEN');
  });

  it('чип инвентаря: цвет операции без слова цвета, чужой цвет — как написано', () => {
    expect(equipmentChip('синие швабра', 'BLUE')).toEqual({ label: 'швабра', zone: 'BLUE' });
    expect(equipmentChip('ведро', 'BLUE')).toEqual({ label: 'ведро', zone: 'BLUE' });
    expect(equipmentChip('красные перчатки', 'BLUE')).toEqual({
      label: 'красные перчатки',
      zone: 'RED',
    });
    expect(equipmentChip('ведро', null)).toEqual({ label: 'ведро', zone: null });
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
