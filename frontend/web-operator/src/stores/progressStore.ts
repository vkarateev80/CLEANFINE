import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Локальный прогресс маршрута и чек-листов (route_map.md §3.3, checklist.md §3.6).
 * Сервер хранит только факты завершения операций/помещений по заявке; статус
 * точки «пропущено» и таймеры операций живут только здесь.
 */
export type PointLocalStatus = 'done' | 'skipped';

export interface PointLocal {
  status: PointLocalStatus;
  reason?: string;
  at: string;
}

export interface OperationLocal {
  /** Старт таймера (wall-clock): таймер переживает перезагрузку страницы. */
  startedAt?: string;
  /** Отмечено локально (ушло на сервер или ждёт в очереди). */
  completedAt?: string;
  /** Фото уже загружено в file-service — повторно не грузим. */
  photoUrl?: string;
  photoFileId?: string;
  /** true — завершение лежит в очереди, сервер ещё не подтвердил. */
  pendingSync?: boolean;
}

interface ProgressState {
  /** eventId → pointId → локальный статус точки. */
  points: Record<string, Record<string, PointLocal>>;
  /** `${ticketId}:${roomId}:${operationId}` → состояние операции. */
  operations: Record<string, OperationLocal>;
  /** `${ticketId}:${roomId}` → помещение завершено локально (ISO). */
  rooms: Record<string, string>;
  markPoint: (eventId: string, pointId: string, status: PointLocalStatus, reason?: string) => void;
  unmarkPoint: (eventId: string, pointId: string) => void;
  setOperation: (key: string, patch: OperationLocal) => void;
  markRoom: (key: string) => void;
  clearAll: () => void;
}

export function operationKey(ticketId: string, roomId: string, operationId: string): string {
  return `${ticketId}:${roomId}:${operationId}`;
}

export function roomKey(ticketId: string, roomId: string): string {
  return `${ticketId}:${roomId}`;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      points: {},
      operations: {},
      rooms: {},
      markPoint: (eventId, pointId, status, reason) =>
        set((state) => ({
          points: {
            ...state.points,
            [eventId]: {
              ...(state.points[eventId] ?? {}),
              [pointId]: { status, reason, at: new Date().toISOString() },
            },
          },
        })),
      unmarkPoint: (eventId, pointId) =>
        set((state) => {
          const forEvent = { ...(state.points[eventId] ?? {}) };
          delete forEvent[pointId];
          return { points: { ...state.points, [eventId]: forEvent } };
        }),
      setOperation: (key, patch) =>
        set((state) => ({
          operations: {
            ...state.operations,
            [key]: { ...(state.operations[key] ?? {}), ...patch },
          },
        })),
      markRoom: (key) =>
        set((state) => ({ rooms: { ...state.rooms, [key]: new Date().toISOString() } })),
      clearAll: () => set({ points: {}, operations: {}, rooms: {} }),
    }),
    { name: 'cleanfine-operator-progress' },
  ),
);

/** Сколько точек маршрута смены отмечено выполненными локально. */
export function countDonePoints(points: Record<string, PointLocal> | undefined): number {
  if (!points) return 0;
  return Object.values(points).filter((p) => p.status === 'done').length;
}
