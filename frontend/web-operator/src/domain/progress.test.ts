import { describe, expect, it } from 'vitest';
import { computePointViews, countDone, isOperationDone, nextPendingPoint } from './progress';
import type { RouteDetail, RoutePointWithRoom } from '../types/core';
import type { TicketDetail } from '../types/tickets';

function room(id: string, techOps: string[] | null): RoutePointWithRoom['room'] {
  return {
    id,
    floorId: 'f1',
    name: id,
    areaM2: 10,
    floorType: 'Офис',
    coordsX: 10,
    coordsY: 10,
    coordsWidth: 20,
    coordsHeight: 20,
    zone: null,
    techCardId: techOps ? `tc-${id}` : null,
    createdAt: '',
    updatedAt: '',
    techCard: techOps ? { id: `tc-${id}`, operations: techOps.map((op) => ({ id: op })) } : null,
  };
}

function route(points: Array<[string, string[] | null]>): RouteDetail {
  return {
    id: 'r1',
    floorId: 'f1',
    name: 'Маршрут',
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    floor: { id: 'f1', objectId: 'o1', name: 'ГД', number: 1, planImageUrl: null },
    points: points.map(([id, ops], index) => ({
      id: `p-${id}`,
      routeId: 'r1',
      roomId: id,
      orderIndex: index,
      estimatedTimeMin: 5,
      room: room(id, ops),
    })),
    totalEstimatedTimeMin: 15,
    operationsTotal: points.reduce((sum, [, ops]) => sum + (ops?.length ?? 0), 0),
  };
}

function ticket(completions: Array<[roomId: string, operationId: string]>): TicketDetail {
  return {
    id: 't1',
    type: 'planned',
    priority: 'normal',
    status: 'in_progress',
    objectId: 'o1',
    roomId: null,
    assigneeId: 'u1',
    createdBy: 'u0',
    description: '',
    lat: null,
    lng: null,
    assignedAt: null,
    acceptedAt: null,
    arrivedAt: null,
    completedAt: null,
    verifiedAt: null,
    closedAt: null,
    escalatedAt: null,
    overdueAt: null,
    reactionDeadline: null,
    arrivalDeadline: null,
    completionDeadline: null,
    operationsTotal: null,
    roomsTotal: null,
    createdAt: '',
    updatedAt: '',
    assignments: [],
    comments: [],
    operations: completions.map(([roomId, operationId], i) => ({
      id: `c${i}`,
      ticketId: 't1',
      operationId,
      roomId,
      completedAt: '2026-10-09T10:00:00Z',
      photoUrl: null,
      completedBy: 'u1',
      createdAt: '',
    })),
    operationsCompleted: completions.length,
  };
}

const base = { localPoints: undefined, localRooms: {}, localOperations: {}, ticketId: 't1' };

describe('computePointViews (route_map.md §3.3)', () => {
  it('первая незавершённая точка — текущая, остальные ожидают', () => {
    const views = computePointViews({
      route: route([
        ['a', ['op1']],
        ['b', ['op2']],
      ]),
      ticket: ticket([]),
      ...base,
    });
    expect(views.map((v) => v.status)).toEqual(['active', 'pending']);
    expect(nextPendingPoint(views)?.point.room.id).toBe('a');
  });

  it('точка выполнена, когда все операции техкарты отмечены на сервере для этого помещения', () => {
    const views = computePointViews({
      route: route([
        ['a', ['op1', 'op2']],
        ['b', ['op1']],
      ]),
      ticket: ticket([
        ['a', 'op1'],
        ['a', 'op2'],
      ]),
      ...base,
    });
    expect(views[0].status).toBe('done');
    expect(views[0].opsDone).toBe(2);
    // Та же техкарта во втором помещении — операции независимы (ключ включает roomId).
    expect(views[1].status).toBe('active');
    expect(countDone(views)).toBe(1);
  });

  it('локальная отметка операции и локальное завершение помещения считаются', () => {
    const views = computePointViews({
      route: route([
        ['a', ['op1']],
        ['b', ['op2']],
      ]),
      ticket: ticket([]),
      localPoints: undefined,
      localRooms: { 't1:b': '2026-10-09T10:00:00Z' },
      localOperations: { 't1:a:op1': { completedAt: '2026-10-09T10:00:00Z' } },
      ticketId: 't1',
    });
    expect(views.map((v) => v.status)).toEqual(['done', 'done']);
    expect(nextPendingPoint(views)).toBeNull();
  });

  it('пропущенная точка не становится текущей, текущая — следующая ожидающая', () => {
    const views = computePointViews({
      route: route([
        ['a', ['op1']],
        ['b', ['op2']],
        ['c', null],
      ]),
      ticket: ticket([]),
      localPoints: { 'p-a': { status: 'skipped', reason: 'заперто', at: '' } },
      localRooms: {},
      localOperations: {},
      ticketId: 't1',
    });
    expect(views.map((v) => v.status)).toEqual(['skipped', 'active', 'pending']);
    expect(views[0].skipReason).toBe('заперто');
    // Без техкарты точка закрывается только вручную.
    expect(views[2].opsTotal).toBe(0);
  });

  it('isOperationDone принимает серверные записи без roomId (старые данные)', () => {
    expect(
      isOperationDone(
        { ticket: ticket([['', 'op1']]), localOperations: {}, ticketId: 't1' },
        'a',
        'op1',
      ),
    ).toBe(true);
    expect(
      isOperationDone(
        { ticket: ticket([['b', 'op1']]), localOperations: {}, ticketId: 't1' },
        'a',
        'op1',
      ),
    ).toBe(false);
  });
});
