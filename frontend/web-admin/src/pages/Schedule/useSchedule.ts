import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAllRoutes, listObjects } from '../../api/core';
import {
  checkMissed,
  generateForDate,
  getSchedulerState,
  listEvents,
  listMyEvents,
  listSchedules,
} from '../../api/schedule';
import { listUsers } from '../../api/users';
import type {
  GenerationResult,
  ListEventsQuery,
  MissedScanResult,
  MyEventsQuery,
} from '../../types/schedule';

/**
 * Данные экрана «Графики и смены» (М4.6). Все ключи начинаются с `['schedule', …]`
 * намеренно: одна инвалидация `['schedule']` после создания графика, удаления и
 * особенно после ручной генерации обновляет разом список графиков И таблицу смен.
 * Если бы ключи разошлись (например `['schedules']` + `['schedule-events']`), после
 * «Сгенерировать смены на дату» список смен остался бы старым до перезагрузки — ровно
 * тот дефект, из-за которого генерацию перестают замечать.
 */

/** Максимум `take` на бэкендах — 100; больше в один запрос не попросить. */
export const MAX_TAKE = 100;

/** Графики с числом смен. Пагинации в контракте нет: список отдаётся целиком. */
export function useSchedules() {
  return useQuery({
    queryKey: ['schedule', 'list'],
    queryFn: () => listSchedules(),
  });
}

/**
 * Смены дня. `keepPreviousData` — чтобы при смене даты/фильтра таблица не
 * схлопывалась в скелетон и не «прыгала» (то же решение, что в «Материалах»).
 */
export function useDayEvents(query: ListEventsQuery) {
  return useQuery({
    queryKey: ['schedule', 'events', query],
    queryFn: () => listEvents(query),
    placeholderData: keepPreviousData,
  });
}

/** Смены текущего пользователя за период: id берётся из JWT на бэкенде. */
export function useMyEvents(query: MyEventsQuery) {
  return useQuery({
    queryKey: ['schedule', 'my', query],
    queryFn: () => listMyEvents(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Объекты для селектов: первая сотня, как на остальных экранах. Отдельный ключ
 * (без префикса `schedule`) — общий справочник ядра, который не должен
 * перезапрашиваться при каждой инвалидации расписания.
 */
export function useObjectOptions() {
  return useQuery({
    queryKey: ['schedule-object-options'],
    queryFn: () => listObjects({ skip: 0, take: MAX_TAKE }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Маршруты для селекта в форме графика (`GET /api/routes`).
 *
 * `objectId === ''` — все маршруты стенда (первая сотня): график можно привязать
 * и к маршруту без объекта. Ключ включает `objectId`, поэтому смена объекта в
 * форме — отдельный запрос, а не фильтрация уже загруженного списка: серверный
 * фильтр и клиентский обязаны совпадать, иначе в селект попадут чужие маршруты.
 * `staleTime` — как у справочника объектов: маршруты меняются редко.
 */
export function useRouteOptions(objectId: string) {
  return useQuery({
    queryKey: ['schedule-route-options', objectId],
    queryFn: () => listAllRoutes({ take: MAX_TAKE, ...(objectId === '' ? {} : { objectId }) }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Сотрудники для фильтра исполнителя и списка исполнителей графика.
 *
 * `GET /api/users` в auth-service закрыт `@Roles('ADMIN','SUPERVISOR')`, поэтому
 * запрос включается только при праве управлять графиком: у оператора и заказчика
 * он вернул бы 403 и красный баннер на экране, который им в остальном доступен.
 * Фильтр «исполнитель» на вкладке «Смены дня» поэтому показывается вместе с этим
 * правом (см. `DayEventsPanel`).
 */
export function useUserOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['schedule-user-options'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () => listUsers({ take: MAX_TAKE, isActive: true }),
  });
}

/** Состояние периодических проходов (ADMIN). Запрашивается только по кнопке. */
export function useSchedulerState(enabled: boolean) {
  return useQuery({
    queryKey: ['schedule', 'scheduler-state'],
    enabled,
    // Состояние живёт в памяти сервиса и меняется каждым проходом: показываем
    // всегда свежие отметки, поэтому кэш не держим. `gcTime: 0` тут был бы ошибкой —
    // результат удалялся бы сразу после отрисовки, и блок состояния оставался пустым.
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => getSchedulerState(),
  });
}

/**
 * Ручная генерация смен на дату (ADMIN). Инвалидация всего `['schedule']`:
 * генерация меняет и список графиков (число смен), и таблицу дня.
 */
export function useGenerateDay() {
  const queryClient = useQueryClient();
  return useMutation<GenerationResult, unknown, string>({
    mutationFn: (date: string) => generateForDate(date),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

/** Ручной прогон неявок и авто check-out (ADMIN). */
export function useCheckMissed() {
  const queryClient = useQueryClient();
  return useMutation<MissedScanResult, unknown, string>({
    mutationFn: (date: string) => checkMissed(date),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}
