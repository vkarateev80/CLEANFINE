import { describe, expect, it } from 'vitest';
import type { TicketEntity } from '../../types/tickets';
import {
  buildTicketPatch,
  editErrorsOf,
  editValuesOf,
  validateCoordinate,
  withAssignee,
  withStatus,
} from './ticketEdit';

const TICKET: TicketEntity = {
  id: 't-1',
  type: 'planned',
  priority: 'normal',
  status: 'closed',
  objectId: 'obj-1',
  roomId: 'room-1',
  assigneeId: 'u-op',
  createdBy: 'u-admin',
  description: 'Влажная уборка холла',
  lat: 55.75,
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
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const values = editValuesOf(TICKET);

describe('buildTicketPatch', () => {
  it('без изменений запрос пуст', () => {
    expect(buildTicketPatch(TICKET, values)).toEqual({});
  });

  it('несёт только изменённые поля, текст без пробелов по краям', () => {
    expect(
      buildTicketPatch(TICKET, { ...values, priority: 'high', description: '  Новый текст ' }),
    ).toEqual({ priority: 'high', description: 'Новый текст' });
  });

  it('пустые помещение, исполнитель и координата — null, а не пустая строка', () => {
    expect(buildTicketPatch(TICKET, { ...values, roomId: '', assigneeId: '', lat: ' ' })).toEqual({
      roomId: null,
      assigneeId: null,
      lat: null,
    });
  });

  it('координата сравнивается как число', () => {
    expect(buildTicketPatch(TICKET, { ...values, lat: '55.750' })).toEqual({});
    expect(buildTicketPatch(TICKET, { ...values, lng: '37.6' })).toEqual({ lng: 37.6 });
  });
});

describe('связь статуса и исполнителя', () => {
  it('статус «Новая» снимает исполнителя', () => {
    expect(withStatus(values, 'new')).toMatchObject({ status: 'new', assigneeId: '' });
    expect(withStatus(values, 'completed')).toMatchObject({
      status: 'completed',
      assigneeId: 'u-op',
    });
  });

  it('исполнитель на новой заявке → «Назначена», снятие с назначенной → «Новая»', () => {
    const fresh = { ...values, status: 'new' as const, assigneeId: '' };
    expect(withAssignee(fresh, 'u-op2')).toMatchObject({ status: 'assigned', assigneeId: 'u-op2' });
    const assigned = { ...values, status: 'assigned' as const };
    expect(withAssignee(assigned, '')).toMatchObject({ status: 'new', assigneeId: '' });
  });

  it('в остальных статусах смена исполнителя статус не меняет', () => {
    expect(withAssignee(values, '')).toMatchObject({ status: 'closed', assigneeId: '' });
  });
});

describe('editErrorsOf', () => {
  it('исходная заявка проходит', () => {
    expect(editErrorsOf(TICKET, values)).toEqual({});
  });

  it('пустые объект и описание, неверные координаты', () => {
    expect(
      editErrorsOf(TICKET, { ...values, objectId: '', description: '  ', lat: '91', lng: 'abc' }),
    ).toEqual({
      objectId: 'Выберите объект',
      description: 'Опишите работы',
      lat: 'Широта — от -90 до 90',
      lng: 'Долгота — число',
    });
  });

  it('«В работе» без исполнителя нельзя, но старую такую заявку править можно', () => {
    expect(
      editErrorsOf(TICKET, { ...values, status: 'in_progress', assigneeId: '' }).assigneeId,
    ).toBe('Для этого статуса укажите исполнителя');
    const legacy = { ...TICKET, status: 'in_progress' as const, assigneeId: null };
    expect(editErrorsOf(legacy, { ...editValuesOf(legacy), priority: 'high' })).toEqual({});
  });
});

describe('validateCoordinate', () => {
  it('пусто — можно, вне диапазона и не число — ошибка', () => {
    expect(validateCoordinate(' ', -90, 90, 'Широта')).toBeUndefined();
    expect(validateCoordinate('55.7', -90, 90, 'Широта')).toBeUndefined();
    expect(validateCoordinate('-91', -90, 90, 'Широта')).toBe('Широта — от -90 до 90');
    expect(validateCoordinate('x', -90, 90, 'Широта')).toBe('Широта — число');
  });
});
