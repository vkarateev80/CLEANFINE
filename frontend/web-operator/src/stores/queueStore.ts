import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Очередь отложенных действий (offline.md §4). Записи живут в localStorage,
 * фото к ним — в IndexedDB (`lib/photoStore.ts`). Порядок прохода — по
 * приоритету вида, внутри вида — FIFO по `createdAt`.
 */
export type QueueKind =
  'sos' | 'operation_complete' | 'room_complete' | 'point_skip' | 'chat_message';

export type QueueStatus = 'pending' | 'sending' | 'failed' | 'synced';

export const QUEUE_PRIORITY: Record<QueueKind, number> = {
  sos: 1,
  operation_complete: 2,
  room_complete: 3,
  point_skip: 4,
  chat_message: 5,
};

export interface QueueItem {
  id: string;
  kind: QueueKind;
  payload: Record<string, unknown>;
  /** Человекочитаемая подпись для экрана очереди («Операция «Смыть…» · Каб. 211»). */
  label: string;
  idempotencyKey: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  syncedAt: string | null;
}

interface QueueState {
  items: QueueItem[];
  enqueue: (
    item: Omit<
      QueueItem,
      'id' | 'status' | 'attempts' | 'lastError' | 'nextAttemptAt' | 'createdAt' | 'syncedAt'
    >,
  ) => QueueItem;
  update: (id: string, patch: Partial<QueueItem>) => void;
  remove: (id: string) => void;
  clearSynced: () => void;
  clearAll: () => void;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set) => ({
      items: [],
      enqueue: (draft) => {
        const item: QueueItem = {
          ...draft,
          id: newId(),
          status: 'pending',
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
          createdAt: new Date().toISOString(),
          syncedAt: null,
        };
        set((state) => {
          // Один ключ идемпотентности — одна запись: повторное действие заменяет старую.
          const rest = state.items.filter((it) => it.idempotencyKey !== item.idempotencyKey);
          return { items: [...rest, item] };
        });
        return item;
      },
      update: (id, patch) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        })),
      remove: (id) => set((state) => ({ items: state.items.filter((it) => it.id !== id) })),
      clearSynced: () =>
        set((state) => ({ items: state.items.filter((it) => it.status !== 'synced') })),
      clearAll: () => set({ items: [] }),
    }),
    { name: 'cleanfine-operator-queue' },
  ),
);

/** Сколько действий ждут отправки (pending + failed + sending) — счётчик в шапке. */
export function selectPendingCount(state: QueueState): number {
  return state.items.filter((it) => it.status !== 'synced').length;
}

export function usePendingCount(): number {
  return useQueueStore(selectPendingCount);
}
