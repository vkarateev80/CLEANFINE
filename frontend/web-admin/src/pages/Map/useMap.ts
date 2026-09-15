import { useMutation, useQuery } from '@tanstack/react-query';
import { listObjects } from '../../api/core';
import { getTrackHistory, listGeofences, listNearbyEmployees } from '../../api/gps';
import { listUsers } from '../../api/users';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import type { TrackHistoryResponse } from '../../types/gps';
import { TRACK_LIMIT, TRACK_WINDOW_HOURS, type LatLng } from './helpers';

/**
 * Данные экрана «Карта». Справочник объектов нужен для селекта и центрирования,
 * справочник сотрудников — чтобы подписать маркеры (gps-service отдаёт только
 * userId): `/api/users` доступен ролям ADMIN/SUPERVISOR, поэтому запрос включён
 * по правам, а для остальных ролей в таблице остаётся короткий id.
 */

/** Максимум `take` на бэкенде — 100; больше в один запрос не попросить. */
const MAX_TAKE = 100;

/** Объекты для селекта и центрирования карты (первая сотня). */
export function useObjectOptions() {
  return useQuery({
    queryKey: ['map-objects'],
    queryFn: () => listObjects({ skip: 0, take: MAX_TAKE }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Геозоны: без выбранного объекта — все (так их видно до выбора), с объектом —
 * только его. `placeholderData` сохраняет прошлый список, поэтому таблица не
 * мигает «пусто» на время смены фильтра.
 */
export function useGeofences(objectId: string | null) {
  return useQuery({
    queryKey: ['map-geofences', objectId],
    queryFn: () => listGeofences(objectId ? { objectId } : {}),
    placeholderData: (previous) => previous,
    staleTime: 30 * 1000,
  });
}

/** Ближние сотрудники вокруг центра карты: последняя точка не старше 5 минут. */
export function useNearbyEmployees(center: LatLng, radius: number) {
  return useQuery({
    queryKey: ['map-nearby', center.lat, center.lng, radius],
    queryFn: () => listNearbyEmployees({ lat: center.lat, lng: center.lng, radius }),
    placeholderData: (previous) => previous,
    staleTime: 15 * 1000,
  });
}

/** Справочник имён: колонка «Сотрудник» и подписи маркеров. */
export function useEmployeeNames() {
  const allowed = useCanAssignTicket();
  return useQuery({
    queryKey: ['map-employees'],
    enabled: allowed,
    staleTime: 5 * 60 * 1000,
    queryFn: () => listUsers({ take: MAX_TAKE }),
  });
}

/**
 * История трека выбранного сотрудника. Это действие пользователя (кнопка
 * «Трек»), а не состояние экрана, поэтому мутация, а не запрос: лишний трек не
 * должен подтягиваться при каждом изменении радиуса.
 */
export function useTrackHistory() {
  return useMutation<TrackHistoryResponse, unknown, string>({
    mutationFn: (userId: string) =>
      getTrackHistory({
        userId,
        from: new Date(Date.now() - TRACK_WINDOW_HOURS * 60 * 60 * 1000).toISOString(),
        limit: TRACK_LIMIT,
      }),
  });
}
