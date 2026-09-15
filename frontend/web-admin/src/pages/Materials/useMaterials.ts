import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listObjects } from '../../api/core';
import {
  getConsumptionReport,
  listMaterials,
  listMovements,
  listStocks,
} from '../../api/materials';
import { listTickets } from '../../api/tickets';
import type {
  ListMaterialsQuery,
  ListMovementsQuery,
  ReportQuery,
  StocksQuery,
} from '../../types/materials';
import type { ListTicketsQuery } from '../../types/tickets';

/**
 * Данные экрана «Материалы» (М4.3). Все ключи начинаются с `['materials', …]`:
 * одной инвалидацией `['materials']` после движения или правки справочника
 * обновляются разом список, остатки, история и отчёт — иначе после прихода
 * остаток в таблице оставался бы старым до перезагрузки страницы.
 */

/** Максимум `take` в material-service — 100; больше в один запрос не попросить. */
export const MAX_TAKE = 100;

/** Справочник с серверным поиском по названию и поставщику. */
export function useMaterialsList(query: ListMaterialsQuery) {
  return useQuery({
    queryKey: ['materials', 'list', query],
    queryFn: () => listMaterials(query),
    // При смене поиска/страницы старые строки остаются на месте — таблица не «прыгает».
    placeholderData: keepPreviousData,
  });
}

/** Остатки: без `objectId` — по всем объектам, `onlyLow` — только ниже порога. */
export function useStocks(query: StocksQuery) {
  return useQuery({
    queryKey: ['materials', 'stocks', query],
    queryFn: () => listStocks(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * История движений одного материала. Запрос выключен, пока материал не выбран:
 * контракт `GET /api/materials/:id/movements` требует id, эндпоинта «все
 * движения» в сервисе нет.
 */
export function useMovementHistory(materialId: string | null, query: ListMovementsQuery) {
  return useQuery({
    queryKey: ['materials', 'movements', materialId, query],
    queryFn: () => listMovements(materialId as string, query),
    enabled: Boolean(materialId),
    placeholderData: keepPreviousData,
  });
}

/** Отчёт по расходу: агрегаты `OUT`/`WRITE_OFF` и итог по стоимости. */
export function useReport(query: ReportQuery) {
  return useQuery({
    queryKey: ['materials', 'report', query],
    queryFn: () => getConsumptionReport(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Объекты для селектов: первая сотня, как на остальных экранах. Отдельный ключ
 * (`materials-object-options`) — общий справочник, который не должен
 * перезапрашиваться при каждой инвалидации складских данных.
 */
export function useObjectOptions() {
  return useQuery({
    queryKey: ['materials-object-options'],
    queryFn: () => listObjects({ skip: 0, take: MAX_TAKE }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Последние заявки для привязки движения; `take` на бэкенде ≤ 100. */
const TICKET_OPTIONS_TAKE = 50;

/**
 * Параметры подборки заявок. `search` уже принимает `ListTicketsQueryDto`
 * ticket-service (М4.3), но фронтовый `ListTicketsQuery` его пока не описывает
 * (файл `types/tickets.ts` вне зоны этой задачи), поэтому расширяем тип локально:
 * объект не литерал в месте вызова, так что лишнее поле не ломает типизацию
 * `listTickets`, и подменять вызов прямым `apiClient` (путь `/tickets` разошёлся бы
 * с контроллером) не приходится.
 */
type TicketOptionsQuery = ListTicketsQuery & { search?: string };

/** Запрос подборки заявок: пустой поиск не отправляем — сервер вернёт последние. */
function ticketOptionsQuery(search: string): TicketOptionsQuery {
  const trimmed = search.trim();
  return {
    skip: 0,
    take: TICKET_OPTIONS_TAKE,
    ...(trimmed === '' ? {} : { search: trimmed }),
  };
}

/**
 * Список заявок для необязательной привязки расхода/списания (М4.3).
 *
 * Ключ `['materials', 'ticket-options', search]` — соглашение экрана «Материалы»:
 * одной инвалидацией `['materials']` после движения обновляется и он. `search`
 * уходит на сервер (`ListTicketsQueryDto.search`): на стенде с историей нужной
 * заявки в последних 50 может не оказаться, а без параметра поведение прежнее —
 * последние заявки без фильтра. `staleTime` держит справочник в кэше, иначе каждое
 * открытие модалки движения тянуло бы список заявок заново.
 */
export function useTicketOptions(search = '') {
  return useQuery({
    queryKey: ['materials', 'ticket-options', search.trim()],
    queryFn: () => listTickets(ticketOptionsQuery(search)),
    staleTime: 5 * 60 * 1000,
  });
}
