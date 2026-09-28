import { describe, expect, it } from 'vitest';
import { findTemplate, type RouteTemplate } from './library';
import { planRoutePoints } from './instantiate';

const route = findTemplate('rt-daily') as RouteTemplate;

describe('planRoutePoints — привязка точек шаблона к помещениям этажа', () => {
  it('точек больше, чем помещений — привязываются все помещения', () => {
    const planned = planRoutePoints(route, [{ id: 'room-1' }, { id: 'room-2' }]);
    expect(planned).toHaveLength(2);
    expect(planned[0]).toEqual({ roomId: 'room-1', label: 'Ресепшен', estimatedTimeMin: 10 });
    expect(planned[1]).toEqual({ roomId: 'room-2', label: 'Открытая зона', estimatedTimeMin: 20 });
  });

  it('помещений больше, чем точек — лишние помещения без точек', () => {
    const rooms = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
    const planned = planRoutePoints(route, rooms);
    expect(planned).toHaveLength(route.points.length);
    expect(planned.some((p) => p.roomId === 'f' || p.roomId === 'g')).toBe(false);
  });

  it('на этаже без помещений — понятная ошибка', () => {
    expect(() => planRoutePoints(route, [])).toThrow(/нет помещений/);
  });

  it('порядок добавления (createdAt) важнее порядка списка сервера', () => {
    const planned = planRoutePoints(route, [
      { id: 'second', createdAt: '2026-09-28T12:00:01.000Z' },
      { id: 'first', createdAt: '2026-09-28T12:00:00.000Z' },
    ]);
    expect(planned[0].roomId).toBe('first');
    expect(planned[1].roomId).toBe('second');
  });
});
