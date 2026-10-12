import { describe, expect, it } from 'vitest';
import { computeRouteProgress, overallProgress, ticketShiftDate } from './routeProgress';

const route = {
  points: [
    { id: 'p2', routeId: 'r', roomId: 'room-b', orderIndex: 1, estimatedTimeMin: 10, room: { name: 'Кухня' } },
    { id: 'p1', routeId: 'r', roomId: 'room-a', orderIndex: 0, estimatedTimeMin: 10, room: { name: 'Холл' } },
    { id: 'p3', routeId: 'r', roomId: 'room-c', orderIndex: 2, estimatedTimeMin: 10, room: { name: 'Санузел' } },
  ],
} as never;

describe('computeRouteProgress', () => {
  it('нулевой прогресс — все точки серые, текущей нет', () => {
    const summary = computeRouteProgress(route, { operations: [], rooms: [], status: 'assigned' });
    expect(summary.points.map((p) => p.status)).toEqual(['pending', 'pending', 'pending']);
    expect(summary.points.map((p) => p.roomName)).toEqual(['Холл', 'Кухня', 'Санузел']);
    expect(summary.percent).toBe(0);
    expect(summary.currentPointId).toBeNull();
  });

  it('завершённое помещение — зелёное, помещение с операциями — жёлтое', () => {
    const summary = computeRouteProgress(route, {
      status: 'in_progress',
      rooms: [{ id: 'rc', ticketId: 't', roomId: 'room-a', completedAt: '2026-10-12T10:00:00Z', completedBy: null, createdAt: '' }],
      operations: [
        { id: 'o1', ticketId: 't', operationId: 'op', roomId: 'room-b', completedAt: '', photoUrl: null, completedBy: null, createdAt: '' },
      ],
    });
    expect(summary.points.map((p) => p.status)).toEqual(['done', 'active', 'pending']);
    expect(summary.done).toBe(1);
    expect(summary.percent).toBe(33);
    expect(summary.currentPointId).toBe('p2');
  });

  it('выполненная заявка красит все точки зелёным', () => {
    const summary = computeRouteProgress(route, { operations: [], rooms: [], status: 'completed' });
    expect(summary.points.every((p) => p.status === 'done')).toBe(true);
    expect(summary.percent).toBe(100);
  });
});

describe('overallProgress', () => {
  it('серый → жёлтый → зелёный', () => {
    expect(overallProgress(0, 5, false)).toBe('pending');
    expect(overallProgress(0, 5, true)).toBe('active');
    expect(overallProgress(2, 5, true)).toBe('active');
    expect(overallProgress(5, 5, true)).toBe('done');
    expect(overallProgress(1, null, true)).toBe('active');
  });
});

describe('ticketShiftDate', () => {
  it('берёт день из описания плановой заявки, иначе из createdAt', () => {
    expect(
      ticketShiftDate({ description: 'Плановая уборка по графику «X» на 2026-10-09 20:59 UTC', createdAt: '2026-10-08T23:00:00Z' }),
    ).toBe('2026-10-09');
    expect(ticketShiftDate({ description: 'Протечка', createdAt: '2026-10-12T09:00:00Z' })).toBe('2026-10-12');
  });
});
