import { describe, expect, it } from 'vitest';
import type { Sh3dScene } from './parseSh3d';
import { MAX_PLAN_DIMENSION, boundingRect, labelFontSize, layoutPlan } from './planLayout';

/** Сцена 10000×5000 см (100×50 м). */
function sceneFixture(overrides: Partial<Sh3dScene> = {}): Sh3dScene {
  const base: Sh3dScene = {
    walls: [
      { xStart: 0, yStart: 0, xEnd: 1000, yEnd: 0, thickness: 10 },
      { xStart: 100, yStart: 100, xEnd: 600, yEnd: 100, thickness: 10 },
    ],
    rooms: [
      {
        id: 'r1',
        name: 'Кабинет 101',
        areaM2: 15,
        points: [
          { x: 0, y: 0 },
          { x: 500, y: 0 },
          { x: 500, y: 300 },
          { x: 0, y: 300 },
        ],
      },
    ],
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 },
  };
  return { ...base, ...overrides };
}

describe('layoutPlan', () => {
  it('ширина под targetWidth, масштаб = м/пкс из геометрии', () => {
    const layout = layoutPlan(sceneFixture());
    // pxPerCm = 2400/1000 = 2.4; scale = 1/2.4/100 м/пкс.
    expect(layout.pxPerCm).toBeCloseTo(2.4, 6);
    expect(layout.scale).toBeCloseTo(1 / 2.4 / 100, 8);
    expect(layout.width).toBe(Math.ceil(1000 * 2.4) + 80);
    expect(layout.height).toBe(Math.ceil(500 * 2.4) + 80);
  });

  it('Y переворачивается: верх сцены (maxY) → верх картинки', () => {
    const layout = layoutPlan(sceneFixture());
    const pointTop = { x: 0, y: 500 };
    const pointBottom = { x: 0, y: 0 };
    // Прямая проверка через контур: комната касается minY сцены → её низ ниже.
    const room = layout.rooms[0];
    const ys = room.polygon.map((point) => point.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...ys)).toBeLessThanOrEqual(layout.height - 40);
    expect(pointTop.y).toBe(500);
    expect(pointBottom.y).toBe(0);
  });

  it('прямоугольник помещения — целые пиксели, ≥1, внутри плана', () => {
    const layout = layoutPlan(sceneFixture());
    const { rect, width, height } = {
      ...layout.rooms[0],
      width: layout.width,
      height: layout.height,
    };
    expect(Number.isInteger(rect.x)).toBe(true);
    expect(Number.isInteger(rect.y)).toBe(true);
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
  });

  it('площадь помещения — из контура сцены, а не «px·м»', () => {
    const layout = layoutPlan(sceneFixture());
    // Контур 500×300 см = 15 м²; оценка по прямоугольнику обязана быть в м²
    // (регрессия: scale одного достаточно — 3090 м² на ЗИЛ вместо 116).
    expect(layout.rooms[0].areaM2).toBeCloseTo(15, 0);
  });

  it('вырожденная комната не проваливает площадь (минимум 0.01 м²)', () => {
    const scene = sceneFixture({
      rooms: [
        {
          id: 'flat',
          name: '',
          areaM2: 0,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 200, y: 0 },
            { x: 300, y: 0 },
          ],
        },
      ],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 1 },
    });
    const layout = layoutPlan(scene);
    expect(layout.rooms[0].areaM2).toBeGreaterThanOrEqual(0.01);
  });

  it('высокая сцена не превышает лимит размера плана', () => {
    const scene = sceneFixture({
      bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 20000 },
    });
    const layout = layoutPlan(scene);
    expect(layout.width).toBeLessThanOrEqual(MAX_PLAN_DIMENSION);
    expect(layout.height).toBeLessThanOrEqual(MAX_PLAN_DIMENSION);
  });
});

describe('boundingRect', () => {
  it('целочисленная описанная область со стороной ≥1', () => {
    const rect = boundingRect([
      { x: 10.4, y: 20.6 },
      { x: 50.2, y: 20.1 },
      { x: 50.9, y: 60.9 },
      { x: 10.1, y: 60.5 },
    ]);
    expect(rect).toEqual({ x: 10, y: 20, width: 41, height: 41 });
  });
});

describe('labelFontSize', () => {
  it('пустое имя → 0 (подписи нет)', () => {
    expect(labelFontSize({ x: 0, y: 0, width: 200, height: 100 }, '')).toBe(0);
  });

  it('кегль ограничен [11, 30]', () => {
    expect(labelFontSize({ x: 0, y: 0, width: 4, height: 4 }, 'Очень длинное название')).toBe(11);
    expect(labelFontSize({ x: 0, y: 0, width: 4000, height: 2000 }, 'А')).toBe(30);
  });
});
