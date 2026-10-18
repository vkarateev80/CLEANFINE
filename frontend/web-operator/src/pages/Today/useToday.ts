import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getObject, getRoute } from '../../api/core';
import { checkIn, checkOut, getScheduleSettings, listMyEvents } from '../../api/schedule';
import { listMyTickets } from '../../api/tickets';
import { errorMessage } from '../../components/ui/Feedback';
import { previousDay, scheduleToday } from '../../lib/date';
import { LocationUnavailable, getCurrentPosition } from '../../lib/geo';
import { apiStatus } from '../../lib/http';
import { useAuthStore } from '../../stores/authStore';
import { useTimeZoneStore } from '../../stores/timeZoneStore';
import { isNetworkError, useNetStore } from '../../stores/netStore';
import type { ScheduleEvent } from '../../types/schedule';
import { t } from '../../i18n';

/** Текущая смена: открытая имеет приоритет, иначе ближайшая по началу (home_today.md §3.3). */
export function pickCurrentEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  if (events.length === 0) return null;
  return events.find((event) => event.status === 'CHECKED_IN') ?? events[0];
}

export function sortEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
}

/**
 * Смены экрана «Сегодня»: смены сегодняшнего дня плюс открытая смена прошлого —
 * вечерняя смена, перешедшая через полночь, не пропадает с экрана, пока её не закрыли.
 */
export function todayShifts(events: ScheduleEvent[], day: string): ScheduleEvent[] {
  return sortEvents(
    events.filter((event) => event.date === day || event.status === 'CHECKED_IN'),
  );
}

export const TODAY_QUERY_KEY = ['schedule', 'my', 'today'] as const;

/**
 * Сегодняшний день по серверу (`/schedule/settings` — пояс организации), заодно
 * обновляет сохранённый пояс. Без ответа — день по сохранённому поясу.
 */
async function resolveScheduleToday(): Promise<string> {
  try {
    const settings = await getScheduleSettings();
    useTimeZoneStore.getState().setTimeZone(settings.timeZone);
    return settings.today;
  } catch {
    return scheduleToday();
  }
}

/** Смены на сегодня (день в поясе организации, как считает сервер). `gcTime` сутки — кэш и без сети. */
export function useTodayEvents() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const timeZone = useTimeZoneStore((s) => s.timeZone);
  const day = scheduleToday(new Date(), timeZone);
  return useQuery({
    queryKey: [...TODAY_QUERY_KEY, day],
    queryFn: async () => {
      const today = await resolveScheduleToday();
      return todayShifts(await listMyEvents(previousDay(today), today), today);
    },
    enabled: Boolean(accessToken),
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useObject(objectId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'object', objectId],
    queryFn: () => getObject(objectId as string),
    enabled: Boolean(objectId),
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useRoute(routeId: string | null | undefined) {
  return useQuery({
    queryKey: ['core', 'route', routeId],
    queryFn: () => getRoute(routeId as string),
    enabled: Boolean(routeId),
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useMyTickets() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['tickets', 'mine', userId],
    queryFn: () => listMyTickets(userId as string, { take: 20 }),
    enabled: Boolean(userId),
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/** Текст ошибки отметки по коду сервера (home_today.md §4). */
export function shiftActionError(error: unknown): string {
  if (error instanceof LocationUnavailable) return error.message;
  if (isNetworkError(error)) return t('Нет соединения. Проверьте интернет');
  const status = apiStatus(error);
  if (status === 502) return t('Сервис геозон недоступен');
  if (status === 404) return t('Смена на сегодня не найдена');
  if (status === 403 || status === 400) return errorMessage(error);
  if (status !== null && status >= 500) return t('Сервис временно недоступен. Повторите позже');
  return errorMessage(error);
}

/**
 * Отметки смены. Check-in требует координат (геозону проверяет сервер),
 * check-out — нет; обе НЕ ставятся в очередь (offline.md §4.1).
 */
export function useShiftActions() {
  const queryClient = useQueryClient();
  const online = useNetStore((s) => s.online);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: TODAY_QUERY_KEY });
  };

  const checkInMutation = useMutation({
    mutationFn: async (event: ScheduleEvent) => {
      if (!online) throw new LocationUnavailable(t('Нет соединения. Проверьте интернет'));
      const point = await getCurrentPosition();
      return checkIn({ scheduleId: event.scheduleId, lat: point.lat, lng: point.lng });
    },
    onSuccess: () => {
      setMessage({ text: t('Смена открыта'), tone: 'success' });
      invalidate();
    },
    onError: (error) => setMessage({ text: shiftActionError(error), tone: 'error' }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (event: ScheduleEvent) => {
      if (!online) throw new LocationUnavailable(t('Нет соединения. Проверьте интернет'));
      let coords: { lat: number; lng: number } | undefined;
      try {
        const point = await getCurrentPosition(8000);
        coords = { lat: point.lat, lng: point.lng };
      } catch {
        // Закрыть смену можно и без координат: сервер их не требует.
      }
      return checkOut({ scheduleId: event.scheduleId, ...coords });
    },
    onSuccess: () => {
      setMessage({ text: t('Смена закрыта'), tone: 'success' });
      invalidate();
    },
    onError: (error) => setMessage({ text: shiftActionError(error), tone: 'error' }),
  });

  return {
    checkIn: checkInMutation.mutate,
    checkOut: checkOutMutation.mutate,
    busy: checkInMutation.isPending || checkOutMutation.isPending,
    message,
    clearMessage: () => setMessage(null),
  };
}
