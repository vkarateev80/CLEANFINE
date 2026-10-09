import type { QueryClient } from '@tanstack/react-query';
import { sendMessageRest } from '../api/chat';
import { attachFile, uploadPhoto } from '../api/files';
import { addTicketComment, completeOperation, completeRoom, createEmergency } from '../api/tickets';
import { errorMessage } from '../components/ui/Feedback';
import { apiStatus } from './http';
import { deletePhoto, loadPhoto } from './photoStore';
import { useAuthStore } from '../stores/authStore';
import { isNetworkError, useNetStore } from '../stores/netStore';
import { useProgressStore } from '../stores/progressStore';
import { QUEUE_PRIORITY, useQueueStore, type QueueItem } from '../stores/queueStore';
import type { EmergencyTicketPayload } from '../types/tickets';

/**
 * Проход очереди (offline.md §5): по приоритету вида, внутри — FIFO; по одной
 * записи; 4xx (кроме 408/429) — `failed` с текстом сервера, остальное —
 * повтор с экспоненциальной задержкой (1→2→5→10→30→60→300 с, джиттер ±20 %),
 * после 10 попыток — `failed`. `alreadyCompleted` — успех.
 */
const BACKOFF_SECONDS = [1, 2, 5, 10, 30, 60, 300];
const MAX_ATTEMPTS = 10;

let queryClientRef: QueryClient | null = null;
let running = false;
let timer: number | null = null;

export function backoffMs(attempts: number): number {
  const base = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)] * 1000;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

export function orderQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort(
    (a, b) =>
      QUEUE_PRIORITY[a.kind] - QUEUE_PRIORITY[b.kind] || a.createdAt.localeCompare(b.createdAt),
  );
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

async function uploadQueuedPhoto(
  photoKey: string,
  meta: { takenAt?: string; lat?: number; lng?: number },
): Promise<{ id: string; url: string }> {
  const blob = await loadPhoto(photoKey);
  if (!blob) throw new PermanentError('Фото не найдено на устройстве');
  const file = await uploadPhoto(blob, `${photoKey.replace(/[^a-z0-9]/gi, '-')}.jpg`, {
    userName: useAuthStore.getState().user?.fullName,
    ...meta,
  });
  await deletePhoto(photoKey).catch(() => undefined);
  return { id: file.id, url: file.url };
}

class PermanentError extends Error {}

/** Выполняет одну запись; бросает ошибку при неудаче. Возвращает патч payload для частичного прогресса. */
async function execute(item: QueueItem): Promise<Record<string, unknown> | void> {
  const p = item.payload;
  switch (item.kind) {
    case 'sos': {
      let fileId = text(p.fileId);
      let ticketId = text(p.ticketId);
      const patch: Record<string, unknown> = {};
      if (!fileId && text(p.photoKey)) {
        const file = await uploadQueuedPhoto(text(p.photoKey) as string, {
          takenAt: text(p.takenAt),
          lat: num(p.lat),
          lng: num(p.lng),
        });
        fileId = file.id;
        patch.fileId = fileId;
        patch.photoKey = null;
      }
      if (!ticketId) {
        const body: EmergencyTicketPayload = {
          objectId: text(p.objectId) as string,
          description: text(p.description) as string,
          lat: num(p.lat) as number,
          lng: num(p.lng) as number,
          ...(text(p.roomId) ? { roomId: text(p.roomId) } : {}),
          ...(text(p.objectName) ? { objectName: text(p.objectName) } : {}),
          ...(text(p.floor) ? { floor: text(p.floor) } : {}),
          ...(num(p.radiusM) ? { radiusM: num(p.radiusM) } : {}),
        };
        const ticket = await createEmergency(body);
        ticketId = ticket.id;
        patch.ticketId = ticketId;
        queryClientRef?.invalidateQueries({ queryKey: ['tickets', 'mine'] });
      }
      if (fileId && ticketId) {
        try {
          await attachFile(fileId, 'TICKET', ticketId);
        } catch (error) {
          // Заявка создана — привязка фото не делает её неуспешной (sos.md §3.6).
          if (isNetworkError(error)) throw error;
        }
      }
      return patch;
    }
    case 'operation_complete': {
      const ticketId = text(p.ticketId) as string;
      const operationId = text(p.operationId) as string;
      const roomId = text(p.roomId) as string;
      let photoUrl = text(p.photoUrl);
      const patch: Record<string, unknown> = {};
      if (!photoUrl && text(p.photoKey)) {
        const file = await uploadQueuedPhoto(text(p.photoKey) as string, {
          takenAt: text(p.completedAt),
        });
        photoUrl = file.url;
        patch.photoUrl = photoUrl;
        patch.photoKey = null;
        useProgressStore
          .getState()
          .setOperation(`${ticketId}:${roomId}:${operationId}`, { photoUrl, photoFileId: file.id });
      }
      const result = await completeOperation(ticketId, operationId, {
        roomId,
        completedAt: text(p.completedAt),
        ...(photoUrl ? { photoUrl } : {}),
        ...(p.requiresPhoto === true && photoUrl ? { requiresPhoto: true } : {}),
        ...(num(p.totalOperations) ? { totalOperations: num(p.totalOperations) } : {}),
      });
      useProgressStore.getState().setOperation(`${ticketId}:${roomId}:${operationId}`, {
        completedAt: result.completedAt,
        pendingSync: false,
      });
      queryClientRef?.invalidateQueries({ queryKey: ['tickets', 'detail', ticketId] });
      return patch;
    }
    case 'room_complete': {
      const ticketId = text(p.ticketId) as string;
      await completeRoom(ticketId, text(p.roomId) as string, {
        completedAt: text(p.completedAt),
        ...(num(p.totalRooms) ? { totalRooms: num(p.totalRooms) } : {}),
      });
      queryClientRef?.invalidateQueries({ queryKey: ['tickets', 'detail', ticketId] });
      return;
    }
    case 'point_skip': {
      await addTicketComment(text(p.ticketId) as string, text(p.text) as string);
      return;
    }
    case 'chat_message': {
      const chatId = text(p.chatId) as string;
      await sendMessageRest(chatId, text(p.text) as string, text(p.clientMessageId));
      queryClientRef?.invalidateQueries({ queryKey: ['chat', 'messages', chatId] });
      queryClientRef?.invalidateQueries({ queryKey: ['chat', 'chats'] });
      return;
    }
    default:
      throw new PermanentError(`Неизвестный тип действия: ${item.kind}`);
  }
}

/** Один проход очереди. Возвращает число успешно отправленных записей. */
export async function runQueue(): Promise<number> {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const store = useQueueStore.getState();
    const now = Date.now();
    const candidates = orderQueue(store.items).filter(
      (item) =>
        (item.status === 'pending' || item.status === 'sending') &&
        (!item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now),
    );
    for (const item of candidates) {
      if (!useNetStore.getState().online) break;
      useQueueStore.getState().update(item.id, { status: 'sending' });
      try {
        const patch = await execute(item);
        useQueueStore.getState().update(item.id, {
          status: 'synced',
          syncedAt: new Date().toISOString(),
          lastError: null,
          ...(patch ? { payload: { ...item.payload, ...patch } } : {}),
        });
        sent += 1;
      } catch (error) {
        const attempts = item.attempts + 1;
        const status = apiStatus(error);
        const permanent =
          error instanceof PermanentError ||
          (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429);
        if (isNetworkError(error)) {
          useNetStore.getState().setOnline(false);
          useQueueStore.getState().update(item.id, {
            status: 'pending',
            attempts,
            lastError: 'Нет соединения',
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
          });
          break;
        }
        useQueueStore.getState().update(item.id, {
          status: permanent || attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastError: errorMessage(error),
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        });
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

/** Повтор записи вручную: сбрасывает `failed` в `pending` и запускает проход. */
export function retryItem(id: string): Promise<number> {
  useQueueStore.getState().update(id, { status: 'pending', nextAttemptAt: null });
  return runQueue();
}

/**
 * Запуск по сигналам: появление сети, возврат вкладки, старт приложения, затем
 * опрос раз в 30 с, пока очередь не пуста (offline.md §5.1).
 */
export function installQueueRunner(queryClient: QueryClient): void {
  queryClientRef = queryClient;
  if (typeof window === 'undefined') return;
  const kick = () => {
    if (useNetStore.getState().online) void runQueue();
  };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => {
    const pending = useQueueStore
      .getState()
      .items.some((it) => it.status === 'pending' || it.status === 'sending');
    if (pending) kick();
  }, 30_000);
  window.setTimeout(kick, 1500);
}
