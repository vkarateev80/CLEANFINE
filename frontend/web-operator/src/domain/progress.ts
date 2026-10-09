import type { PointLocal } from '../stores/progressStore';
import type { RouteDetail, RoutePointWithRoom } from '../types/core';
import type { TicketDetail } from '../types/tickets';

/**
 * Статусы точек маршрута (route_map.md §3.3). Сервер хранит только факты
 * завершения операций и помещений по заявке; «пропущено» и «текущая» —
 * локальная модель. Чистые функции — покрываются unit-тестами.
 */
export type PointStatus = 'pending' | 'active' | 'done' | 'skipped';

export const POINT_STATUS_LABELS: Record<PointStatus, string> = {
  pending: 'Ожидает',
  active: 'В работе',
  done: 'Выполнено',
  skipped: 'Пропущено',
};

export interface PointView {
  point: RoutePointWithRoom;
  status: PointStatus;
  /** Сколько операций техкарты помещения отмечено (сервер + локально). */
  opsDone: number;
  opsTotal: number;
  skipReason?: string;
}

export interface ProgressInput {
  route: RouteDetail;
  ticket: TicketDetail | null | undefined;
  localPoints: Record<string, PointLocal> | undefined;
  localRooms: Record<string, string>;
  localOperations: Record<string, { completedAt?: string }>;
  ticketId: string | null;
}

/** Операция отмечена: факт сервера (по паре roomId+operationId) или локальная отметка. */
export function isOperationDone(
  input: Pick<ProgressInput, 'ticket' | 'localOperations' | 'ticketId'>,
  roomId: string,
  operationId: string,
): boolean {
  const serverDone = (input.ticket?.operations ?? []).some(
    (completion) =>
      completion.operationId === operationId &&
      (completion.roomId === roomId || completion.roomId === ''),
  );
  if (serverDone) return true;
  const key = `${input.ticketId ?? ''}:${roomId}:${operationId}`;
  return Boolean(input.localOperations[key]?.completedAt);
}

export function computePointViews(input: ProgressInput): PointView[] {
  const views: PointView[] = input.route.points.map((point) => {
    const opIds = point.room.techCard?.operations.map((op) => op.id) ?? [];
    const opsDone = opIds.filter((id) => isOperationDone(input, point.room.id, id)).length;
    const local = input.localPoints?.[point.id];
    const roomDoneLocally = Boolean(input.localRooms[`${input.ticketId ?? ''}:${point.room.id}`]);
    let status: PointStatus = 'pending';
    if (local?.status === 'skipped') status = 'skipped';
    else if (
      local?.status === 'done' ||
      roomDoneLocally ||
      (opIds.length > 0 && opsDone === opIds.length)
    ) {
      status = 'done';
    }
    return { point, status, opsDone, opsTotal: opIds.length, skipReason: local?.reason };
  });
  // Текущая — первая точка в порядке маршрута, которая ещё не выполнена и не пропущена.
  const first = views.find((view) => view.status === 'pending');
  if (first) first.status = 'active';
  return views;
}

export function nextPendingPoint(views: PointView[]): PointView | null {
  return views.find((view) => view.status === 'active' || view.status === 'pending') ?? null;
}

export function countDone(views: PointView[]): number {
  return views.filter((view) => view.status === 'done').length;
}
