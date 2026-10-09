import { describe, expect, it } from 'vitest';
import { parseEquipment } from './OperationTile';

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
