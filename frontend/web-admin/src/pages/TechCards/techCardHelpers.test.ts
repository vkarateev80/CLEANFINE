import { describe, expect, it } from 'vitest';
import { equipmentToText, parseEquipmentInput } from './techCardHelpers';

describe('оборудование: человекочитаемый формат', () => {
  it('объект {items, ppe} → текст «инвентарь; СИЗ»', () => {
    expect(equipmentToText({ items: ['швабра', 'ведро'], ppe: ['перчатки'] })).toBe(
      'швабра, ведро; перчатки',
    );
    expect(equipmentToText({ items: ['пылесос'] })).toBe('пылесос');
    expect(equipmentToText({ ppe: ['маска'] })).toBe('; маска');
    expect(equipmentToText(null)).toBe('');
    expect(equipmentToText({})).toBe('');
  });

  it('текст → объект {items, ppe} (обратное преобразование)', () => {
    expect(parseEquipmentInput('швабра, ведро; перчатки')).toEqual({
      ok: true,
      value: { items: ['швабра', 'ведро'], ppe: ['перчатки'] },
    });
    expect(parseEquipmentInput('пылесос')).toEqual({
      ok: true,
      value: { items: ['пылесос'] },
    });
    expect(parseEquipmentInput('; перчатки')).toEqual({
      ok: true,
      value: { ppe: ['перчатки'] },
    });
    expect(parseEquipmentInput('  ')).toEqual({ ok: true, value: undefined });
  });

  it('круговое преобразование стабильно', () => {
    const original = { items: ['салфетки', 'скребок'], ppe: ['перчатки'] };
    const text = equipmentToText(original);
    expect(parseEquipmentInput(text)).toEqual({ ok: true, value: original });
  });

  it('лишние разделители «;» — понятная ошибка', () => {
    const result = parseEquipmentInput('швабра; перчатки; маска');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/один разделитель/i);
  });

  it('легаси-JSON с произвольными ключами принимается и сохраняется как есть', () => {
    const legacy = { foo: 'bar' };
    const text = equipmentToText(legacy);
    expect(text).toContain('"foo"');
    expect(parseEquipmentInput(text)).toEqual({ ok: true, value: legacy });
  });

  it('невалидный JSON-мусор — ошибка, а не тихая потеря', () => {
    const result = parseEquipmentInput('{ не json');
    expect(result.ok).toBe(false);
  });
});
