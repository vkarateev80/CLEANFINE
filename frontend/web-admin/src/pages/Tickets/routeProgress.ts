import type { RouteDetail } from '../../types/core';
import type { TicketDetailEntity } from '../../types/tickets';

/**
 * Прогресс маршрута по заявке (12.10.2026): админ видит, на каком этапе
 * проход оператора. Факты — из ticket-service: завершённые помещения
 * (`rooms`) и операции с `roomId` (`operations`); порядок точек — из маршрута
 * core-service. Цвета: серый — не начато (нулевой), жёлтый — операции идут,
 * зелёный — помещение завершено.
 */
export type PointProgress = 'pending' | 'active' | 'done';

export interface RoutePointProgress {
  pointId: string;
  roomId: string;
  roomName: string;
  orderIndex: number;
  status: PointProgress;
  /** Отмеченных операций в помещении. */
  operationsDone: number;
  completedAt: string | null;
}

export interface RouteProgressSummary {
  points: RoutePointProgress[];
  total: number;
  done: number;
  active: number;
  /** Доля завершённых помещений, 0–100. */
  percent: number;
  /** Текущая точка: первая незавершённая после начала работы (null — не начато). */
  currentPointId: string | null;
}

export const PROGRESS_LABELS: Record<PointProgress, string> = {
  pending: 'не начато',
  active: 'в работе',
  done: 'завершено',
};

/** Классы фона точки/сегмента по состоянию. */
export const PROGRESS_BG: Record<PointProgress, string> = {
  pending: 'bg-neutral-300',
  active: 'bg-warning-500',
  done: 'bg-success-500',
};

export const PROGRESS_TEXT: Record<PointProgress, string> = {
  pending: 'text-neutral-500',
  active: 'text-warning-600',
  done: 'text-success-600',
};

export function computeRouteProgress(
  route: Pick<RouteDetail, 'points'>,
  ticket: Pick<TicketDetailEntity, 'operations' | 'rooms' | 'status'>,
): RouteProgressSummary {
  const completed = new Map<string, string>();
  for (const room of ticket.rooms ?? []) completed.set(room.roomId, room.completedAt);
  const operationsByRoom = new Map<string, number>();
  for (const operation of ticket.operations) {
    const roomId = operation.roomId ?? '';
    if (roomId === '') continue;
    operationsByRoom.set(roomId, (operationsByRoom.get(roomId) ?? 0) + 1);
  }
  const ticketDone = ticket.status === 'completed' || ticket.status === 'verified' || ticket.status === 'closed';

  const points = [...route.points]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map<RoutePointProgress>((point) => {
      const completedAt = completed.get(point.roomId) ?? null;
      const operationsDone = operationsByRoom.get(point.roomId) ?? 0;
      const status: PointProgress =
        completedAt !== null || ticketDone ? 'done' : operationsDone > 0 ? 'active' : 'pending';
      return {
        pointId: point.id,
        roomId: point.roomId,
        roomName: point.room.name,
        orderIndex: point.orderIndex,
        status,
        operationsDone,
        completedAt,
      };
    });

  const done = points.filter((p) => p.status === 'done').length;
  const active = points.filter((p) => p.status === 'active').length;
  const started = done > 0 || active > 0;
  const current = started ? (points.find((p) => p.status !== 'done') ?? null) : null;
  return {
    points,
    total: points.length,
    done,
    active,
    percent: points.length === 0 ? 0 : Math.round((done / points.length) * 100),
    currentPointId: current?.pointId ?? null,
  };
}

/** Состояние заявки целиком по счётчикам (список/доска): серый → жёлтый → зелёный. */
export function overallProgress(done: number, total: number | null, started: boolean): PointProgress {
  if (total !== null && total > 0 && done >= total) return 'done';
  if (done > 0 || started) return 'active';
  return 'pending';
}

/** День заявки для поиска смены: "YYYY-MM-DD" из описания («… на 2026-10-09 …») или createdAt. */
export function ticketShiftDate(ticket: Pick<TicketDetailEntity, 'description' | 'createdAt'>): string {
  const fromDescription = /на (\d{4}-\d{2}-\d{2})/.exec(ticket.description)?.[1];
  return fromDescription ?? ticket.createdAt.slice(0, 10);
}
