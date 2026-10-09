import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { uploadPhoto } from '../../api/files';
import { completeOperation, completeRoom } from '../../api/tickets';
import { errorMessage } from '../../components/ui/Feedback';
import { computePointViews, countDone, isOperationDone } from '../../domain/progress';
import {
  useEvent,
  useRoom,
  useRouteDetail,
  useTechCard,
  useTicketDetail,
} from '../../hooks/useRouteData';
import { savePhoto } from '../../lib/photoStore';
import { apiStatus } from '../../lib/http';
import type { PreparedPhoto } from '../../lib/photo';
import { useAuthStore } from '../../stores/authStore';
import { isNetworkError, useNetStore } from '../../stores/netStore';
import {
  operationKey,
  roomKey,
  useProgressStore,
  type OperationLocal,
} from '../../stores/progressStore';
import { useQueueStore } from '../../stores/queueStore';
import { showToast } from '../../stores/uiStore';
import type { TechOperationEntity } from '../../types/core';

export interface OperationView {
  op: TechOperationEntity;
  index: number;
  done: boolean;
  locked: boolean;
  /** Эта операция — первая незавершённая: у неё идёт таймер. */
  current: boolean;
  local: OperationLocal;
  key: string;
}

/**
 * Состояние чек-листа помещения (checklist.md). Факты «выполнено» — сервер
 * (заявка смены) + локальные отметки; таймеры и фото — локально.
 */
export function useChecklist(eventId: string, roomId: string) {
  const queryClient = useQueryClient();
  const event = useEvent(eventId);
  const route = useRouteDetail(event.data?.routeId);
  const room = useRoom(roomId);
  const techCard = useTechCard(room.data?.techCardId);
  const ticketId = event.data?.ticketId ?? null;
  const ticket = useTicketDetail(ticketId);
  const online = useNetStore((s) => s.online);
  const userName = useAuthStore((s) => s.user?.fullName);

  const localOperations = useProgressStore((s) => s.operations);
  const localPoints = useProgressStore((s) => s.points[eventId]);
  const localRooms = useProgressStore((s) => s.rooms);
  const setOperation = useProgressStore((s) => s.setOperation);
  const markRoom = useProgressStore((s) => s.markRoom);
  const markPoint = useProgressStore((s) => s.markPoint);
  const enqueue = useQueueStore((s) => s.enqueue);

  const canWork = event.data?.status === 'CHECKED_IN' && Boolean(ticketId);

  const operations = useMemo<OperationView[]>(() => {
    const ops = [...(techCard.data?.operations ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    let currentFound = false;
    return ops.map((op, index) => {
      const key = operationKey(ticketId ?? '', roomId, op.id);
      const done = isOperationDone(
        { ticket: ticket.data, localOperations, ticketId },
        roomId,
        op.id,
      );
      const locked =
        index > 0 &&
        !isOperationDone(
          { ticket: ticket.data, localOperations, ticketId },
          roomId,
          ops[index - 1].id,
        );
      const current = !done && !currentFound;
      if (current) currentFound = true;
      return { op, index, done, locked, current, local: localOperations[key] ?? {}, key };
    });
  }, [techCard.data?.operations, ticket.data, localOperations, ticketId, roomId]);

  const allDone = operations.length > 0 && operations.every((view) => view.done);
  const remaining = operations.filter((view) => !view.done).length;

  // Таймер первой незавершённой операции стартует сам при открытии (checklist.md §3.3).
  const current = operations.find((view) => view.current);
  useEffect(() => {
    if (!canWork || !current || current.local.startedAt) return;
    setOperation(current.key, { startedAt: new Date().toISOString() });
  }, [canWork, current?.key, current?.local.startedAt, setOperation]);

  const totalOperations = route.data?.operationsTotal;
  const pointId = route.data?.points.find((point) => point.room.id === roomId)?.id ?? null;

  const routeProgress = useMemo(() => {
    if (!route.data) return { done: 0, total: 0 };
    const views = computePointViews({
      route: route.data,
      ticket: ticket.data,
      localPoints,
      localRooms,
      localOperations,
      ticketId,
    });
    return { done: countDone(views), total: views.length };
  }, [route.data, ticket.data, localPoints, localRooms, localOperations, ticketId]);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const start = useCallback(
    (view: OperationView) => {
      setOperation(view.key, { startedAt: new Date().toISOString() });
    },
    [setOperation],
  );

  const invalidateTicket = () => {
    if (ticketId) void queryClient.invalidateQueries({ queryKey: ['tickets', 'detail', ticketId] });
  };

  /** Завершение операции: фото → upload → complete; без сети — в очередь. */
  const complete = useCallback(
    async (view: OperationView, photo: PreparedPhoto | null): Promise<boolean> => {
      if (!canWork || !ticketId) return false;
      const { op } = view;
      let photoUrl = view.local.photoUrl;
      if (op.requiresPhoto && !photo && !photoUrl) {
        showToast('Сначала сделайте фото', 'error');
        return false;
      }
      setBusyKey(view.key);
      try {
        const completedAt = new Date().toISOString();
        const payload = {
          ticketId,
          operationId: op.id,
          roomId,
          completedAt,
          requiresPhoto: op.requiresPhoto,
          ...(totalOperations ? { totalOperations } : {}),
        };
        const queueOffline = async () => {
          const item = enqueue({
            kind: 'operation_complete',
            payload: {
              ...payload,
              photoUrl: photoUrl ?? null,
              photoKey: photo && !photoUrl ? `op:${view.key}` : null,
            },
            label: `Операция «${op.name}»`,
            idempotencyKey: `op:${view.key}`,
          });
          if (photo && !photoUrl) await savePhoto(`op:${view.key}`, photo.blob);
          setOperation(view.key, { completedAt, pendingSync: true });
          showToast('Нет соединения — результат сохранится и синхронизируется', 'info');
          return item;
        };

        if (!online) {
          await queueOffline();
          return true;
        }
        if (photo && !photoUrl) {
          try {
            const file = await uploadPhoto(photo.blob, `${op.id}.jpg`, {
              userName,
              takenAt: photo.takenAt,
            });
            photoUrl = file.url;
            setOperation(view.key, { photoUrl: file.url, photoFileId: file.id });
          } catch (error) {
            if (isNetworkError(error)) {
              await queueOffline();
              return true;
            }
            showToast(`Фото отклонено: ${errorMessage(error)}. Снимите заново`, 'error');
            return false;
          }
        }
        try {
          const result = await completeOperation(ticketId, op.id, {
            roomId,
            completedAt,
            ...(photoUrl ? { photoUrl } : {}),
            ...(op.requiresPhoto && photoUrl ? { requiresPhoto: true } : {}),
            ...(totalOperations ? { totalOperations } : {}),
          });
          setOperation(view.key, { completedAt: result.completedAt, pendingSync: false });
          invalidateTicket();
          if (result.alreadyCompleted) showToast('Операция уже была отмечена', 'info');
          return true;
        } catch (error) {
          if (isNetworkError(error)) {
            await queueOffline();
            return true;
          }
          const status = apiStatus(error);
          showToast(
            status && status >= 500
              ? 'Не удалось завершить операцию. Повторить'
              : `Не удалось завершить операцию: ${errorMessage(error)}`,
            'error',
          );
          return false;
        }
      } finally {
        setBusyKey(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWork, ticketId, roomId, totalOperations, online, userName, enqueue, setOperation],
  );

  /** «Завершить помещение»: серверная отметка (идемпотентна) + локальный статус точки. */
  const finishRoom = useCallback(async (): Promise<boolean> => {
    if (!ticketId) return false;
    setBusyKey('room');
    try {
      const markLocal = () => {
        markRoom(roomKey(ticketId, roomId));
        if (pointId) markPoint(eventId, pointId, 'done');
      };
      const totalRooms = route.data?.points.length;
      if (!online) {
        enqueue({
          kind: 'room_complete',
          payload: {
            ticketId,
            roomId,
            completedAt: new Date().toISOString(),
            ...(totalRooms ? { totalRooms } : {}),
          },
          label: `Помещение · ${room.data?.name ?? roomId}`,
          idempotencyKey: `room:${ticketId}:${roomId}`,
        });
        markLocal();
        return true;
      }
      try {
        await completeRoom(ticketId, roomId, {
          completedAt: new Date().toISOString(),
          ...(totalRooms ? { totalRooms } : {}),
        });
        markLocal();
        invalidateTicket();
        return true;
      } catch (error) {
        if (isNetworkError(error)) {
          enqueue({
            kind: 'room_complete',
            payload: {
              ticketId,
              roomId,
              completedAt: new Date().toISOString(),
              ...(totalRooms ? { totalRooms } : {}),
            },
            label: `Помещение · ${room.data?.name ?? roomId}`,
            idempotencyKey: `room:${ticketId}:${roomId}`,
          });
          markLocal();
          return true;
        }
        showToast(`Не удалось завершить помещение: ${errorMessage(error)}`, 'error');
        return false;
      }
    } finally {
      setBusyKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, roomId, pointId, eventId, online, route.data?.points.length, room.data?.name]);

  return {
    event,
    route,
    room,
    techCard,
    ticket,
    ticketId,
    canWork,
    operations,
    allDone,
    remaining,
    routeProgress,
    busyKey,
    start,
    complete,
    finishRoom,
  };
}
