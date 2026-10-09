import { useQuery } from '@tanstack/react-query';
import { getFloor, getRoom, getRoute, getTechCard } from '../api/core';
import { getEvent } from '../api/schedule';
import { getTicket } from '../api/tickets';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Данные смены для маршрута и чек-листа. `gcTime` сутки и `staleTime` 5 мин:
 * маршрут и техкарта за смену не меняются, а кэш TanStack Query — то, что
 * остаётся у экрана без сети (до полноценного оффлайна этапа 5).
 */
export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['schedule', 'event', eventId],
    queryFn: () => getEvent(eventId as string),
    enabled: Boolean(eventId),
    staleTime: 60_000,
    gcTime: DAY,
  });
}

export function useRouteDetail(routeId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'route', routeId],
    queryFn: () => getRoute(routeId as string),
    enabled: Boolean(routeId),
    staleTime: 5 * 60_000,
    gcTime: DAY,
  });
}

export function useFloor(floorId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'floor', floorId],
    queryFn: () => getFloor(floorId as string),
    enabled: Boolean(floorId),
    staleTime: 5 * 60_000,
    gcTime: DAY,
  });
}

export function useRoom(roomId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'room', roomId],
    queryFn: () => getRoom(roomId as string),
    enabled: Boolean(roomId),
    staleTime: 5 * 60_000,
    gcTime: DAY,
  });
}

export function useTechCard(techCardId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'tech-card', techCardId],
    queryFn: () => getTechCard(techCardId as string),
    enabled: Boolean(techCardId),
    staleTime: 5 * 60_000,
    gcTime: DAY,
  });
}

/** Заявка смены — факты завершения операций (сверка статусов точек). */
export function useTicketDetail(ticketId: string | null | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail', ticketId],
    queryFn: () => getTicket(ticketId as string),
    enabled: Boolean(ticketId),
    staleTime: 15_000,
    gcTime: DAY,
  });
}
