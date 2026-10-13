import { describe, expect, it } from 'vitest';
import type { Sh3dScene } from './parseSh3d';
import { layoutPlan } from './planLayout';
import { DEFAULT_IMPORT_FLOOR_TYPE, hasFileType, toImportRoom } from './renderPlan';

/**
 * Сам рендер требует canvas (его нет в jsdom); здесь проверяется чистая часть —
 * сборка помещений для создания из раскладки.
 */
function sceneWith(rooms: Sh3dScene['rooms']): Sh3dScene {
  return {
    walls: [],
    rooms,
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 },
  };
}

const CONTOUR = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 300 },
  { x: 0, y: 300 },
];

describe('toImportRoom (тип помещения из файла)', () => {
  it('roomType из файла становится floorType', () => {
    const layout = layoutPlan(
      sceneWith([{ id: 'k', name: 'Кухня 1', areaM2: 12, points: CONTOUR, type: 'Кухня' }]),
    );
    const room = toImportRoom(layout.rooms[0], 0);
    expect(room.floorType).toBe('Кухня');
    expect(room.name).toBe('Кухня 1');
    expect(room.areaM2).toBeCloseTo(12, 1);
    expect(room).toEqual(
      expect.objectContaining({
        coordsX: layout.rooms[0].rect.x,
        coordsY: layout.rooms[0].rect.y,
        coordsWidth: layout.rooms[0].rect.width,
        coordsHeight: layout.rooms[0].rect.height,
      }),
    );
  });

  it('без свойства остаётся типовой «Офис»; пустой тип — тоже', () => {
    const layout = layoutPlan(
      sceneWith([
        { id: 'a', name: '', areaM2: 12, points: CONTOUR },
        { id: 'b', name: 'Пустой тип', areaM2: 12, points: CONTOUR, type: '   ' },
      ]),
    );
    const [first, second] = layout.rooms.map(toImportRoom);
    expect(first.floorType).toBe(DEFAULT_IMPORT_FLOOR_TYPE);
    expect(first.name).toBe('Помещение 1');
    expect(second.floorType).toBe('Офис');
    expect(hasFileType(layout.rooms[0])).toBe(false);
    expect(hasFileType({ type: 'Лифт' })).toBe(true);
  });
});
