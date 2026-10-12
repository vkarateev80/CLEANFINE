import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLOR_ZONE_META, type ColorZone } from '@cleaning-ops/shared/types/color-coding';
import type { TechOperationEntity } from '../../types/core';
import { OperationTile, parseEquipment } from './OperationTile';

describe('parseEquipment (checklist.md §3.2)', () => {
  it('раскладывает items и ppe по группам', () => {
    expect(parseEquipment({ ppe: ['перчатки'], items: ['синие швабра', 'ведро'] })).toEqual([
      { group: 'items', label: 'синие швабра' },
      { group: 'items', label: 'ведро' },
      { group: 'ppe', label: 'перчатки' },
    ]);
  });

  it('незнакомые ключи — как «ключ: значение», null — пусто', () => {
    expect(parseEquipment({ vacuum: 'Karcher', count: 2 })).toEqual([
      { group: 'other', label: 'vacuum: Karcher' },
      { group: 'other', label: 'count: 2' },
    ]);
    expect(parseEquipment(null)).toEqual([]);
  });
});

function renderTile(name: string, equipment: Record<string, unknown>, roomZone: ColorZone) {
  const op: TechOperationEntity = {
    id: 'op-1',
    techCardId: 'tc-1',
    name,
    orderIndex: 0,
    description: null,
    equipment,
    estimatedTimeMin: 5,
    requiresPhoto: false,
    requiresQr: false,
    materials: [],
  };
  render(
    <OperationTile
      view={{ op, index: 0, done: false, locked: false, current: false, local: {}, key: 'op-1' }}
      previousName={null}
      roomZone={roomZone}
      canWork={false}
      busy={false}
      onStart={() => undefined}
      onPhoto={() => undefined}
      onComplete={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  const row = screen.getByTestId('checklist_op_equipment_op-1');
  const chips = Array.from(row.querySelectorAll<HTMLElement>('span.rounded-full'));
  return {
    caption: within(row).getByTestId('checklist_op_inventory_zone_op-1').textContent,
    chips: chips.map((chip) => ({ label: chip.textContent, borderColor: chip.style.borderColor })),
  };
}

/** jsdom отдаёт цвет из `style` как rgb(…). */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe('OperationTile: цвет инвентаря операции', () => {
  it('цвет, названный на первой позиции, — у всего набора, слово цвета снято с чипа', () => {
    // Сид техкарты ЗИЛ: «Санузел» (красная зона), набор написан синим.
    const { caption, chips } = renderTile(
      'Протереть рабочие поверхности',
      { items: ['синие швабра', 'ведро', 'салфетки', 'распылитель'], ppe: ['перчатки'] },
      'RED',
    );
    expect(caption).toBe('Синий инвентарь:');
    expect(chips.map((chip) => chip.label)).toEqual([
      'швабра',
      'ведро',
      'салфетки',
      'распылитель',
      '🧤 перчатки',
    ]);
    for (const chip of chips) expect(chip.borderColor).toBe(rgb(COLOR_ZONE_META.BLUE.hex));
  });

  it('без слова цвета — цвет помещения', () => {
    const red = renderTile('Помыть пол', { items: ['швабра', 'ведро'] }, 'RED');
    expect(red.caption).toBe('Красный инвентарь:');
    expect(red.chips.every((chip) => chip.borderColor === rgb(COLOR_ZONE_META.RED.hex))).toBe(true);
  });

  it('операция со стёклами без слова цвета — жёлтый набор', () => {
    const glass = renderTile('Протереть зеркала', { items: ['стеклосгон', 'салфетки'] }, 'RED');
    expect(glass.caption).toBe('Жёлтый инвентарь:');
    expect(glass.chips.every((chip) => chip.borderColor === rgb(COLOR_ZONE_META.YELLOW.hex))).toBe(
      true,
    );
  });

  it('позиция, названная другим цветом, остаётся своего цвета и с подписью технолога', () => {
    const { chips } = renderTile(
      'Помыть пол',
      { items: ['синие швабра', 'ведро'], ppe: ['красные перчатки'] },
      'GREEN',
    );
    expect(chips).toEqual([
      { label: 'швабра', borderColor: rgb(COLOR_ZONE_META.BLUE.hex) },
      { label: 'ведро', borderColor: rgb(COLOR_ZONE_META.BLUE.hex) },
      { label: '🧤 красные перчатки', borderColor: rgb(COLOR_ZONE_META.RED.hex) },
    ]);
  });
});
