import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listEvents } from '../../api/schedule';
import { listTickets } from '../../api/tickets';
import { getConsumptionReport, listStocks } from '../../api/materials';
import { daysBetween } from '../../lib/format';
import type { ScheduleEventEntity } from '../../types/schedule';
import type { ConsumptionReport, StockView } from '../../types/materials';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';

/** Статусы «выполненной» заявки — общий словарь для экранов портала. */
export const DONE_TICKET_STATUSES: TicketStatus[] = ['completed', 'verified', 'closed'];

/**
 * Данные экрана «Отчёты» (DS-004, `reports.md`). Отдельного report-service в
 * проекте нет, поэтому экран — клиентская агрегация по трём источникам:
 * заявкам (ticket-service), сменам (schedule-service) и расходу материалов
 * (material-service).
 *
 * Честные ограничения, которые видны в UI, а не «замалчиваются»:
 *  1. `GET /api/tickets` не принимает `from`/`to` — по датам фильтруем на клиенте
 *     и упираемся в предел страницы (`take` ≤ 100, страховочный предел 500 записей);
 *  2. `GET /api/schedule/events` принимает ОДИН `date` (диапазон есть только у
 *     `/schedule/my`, но он отдаёт смены текущего пользователя, а у клиента смен
 *     нет) — поэтому смены периода собираются запросом на каждый день.
 */

/** Страховочный предел клиентской агрегации заявок (reports.md п. 7.2). */
export const MAX_AGGREGATED_TICKETS = 500;
/** Размер страницы `take` — соглашение сервисов (максимум 100). */
export const TICKETS_PAGE_SIZE = 100;

export interface Period {
  from: string;
  to: string;
}

export interface PeriodValidation {
  ok: boolean;
  message: string | null;
}

/**
 * Проверка диапазона ДО запроса (reports.md п. 4.2): `from ≤ to`, не длиннее
 * 366 дней, `to` не в будущем. Иначе сервер вернёт слишком большой набор, а
 * телефон «задумается» — и пользователь не поймёт, почему.
 */
export function validatePeriod(period: Period, today: string): PeriodValidation {
  if (period.from > period.to) {
    return { ok: false, message: 'Дата начала позже даты окончания' };
  }
  if (daysBetween(period.from, period.to) > 366) {
    return { ok: false, message: 'Максимум 366 дней в периоде' };
  }
  if (period.to > today) {
    return { ok: false, message: 'Дата окончания в будущем — данных ещё нет' };
  }
  return { ok: true, message: null };
}

/** Список дат `YYYY-MM-DD` периода включительно. */
export function periodDays(period: Period): string[] {
  const days: string[] = [];
  const start = Date.parse(`${period.from}T00:00:00Z`);
  const end = Date.parse(`${period.to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return days;
  for (let time = start; time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Смены объекта за период: по запросу на каждый день (см. ограничение 2 выше).
 *
 * `staleTime` 5 минут: смены задним числом не меняются, а период переключают
 * несколько раз подряд — повторный запрос тех же дней должен браться из кэша.
 */
export function usePeriodEvents(objectId: string | undefined, period: Period, enabled: boolean) {
  const days = useMemo(() => periodDays(period), [period.from, period.to]);

  const results = useQueries({
    queries: days.map((date) => ({
      queryKey: ['schedule', 'events', objectId, { from: date }],
      queryFn: () => listEvents({ objectId, date }),
      enabled: Boolean(objectId) && enabled,
      staleTime: 300_000,
    })),
  });

  const events = useMemo(() => {
    const all: ScheduleEventEntity[] = [];
    for (const result of results) {
      if (result.data) all.push(...result.data);
    }
    // Дублей быть не должно (один день — один запрос), но дедупликация по id
    // защищает от повторной выдачи сервисом: агрегат не должен зависеть от неё.
    const unique = new Map(all.map((event) => [event.id, event]));
    return Array.from(unique.values()).sort((left, right) =>
      left.plannedStart.localeCompare(right.plannedStart),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  return {
    events,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch()),
  };
}

/**
 * Заявки объекта за период. Серверного фильтра по датам нет, поэтому страницы
 * (по 100) собираются до `total` или до страховочного предела 500 записей;
 * при упоре в предел экран показывает `SoftWarning` о неполноте данных.
 */
export function usePeriodTickets(objectId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: ['tickets', 'report', objectId, MAX_AGGREGATED_TICKETS],
    queryFn: async () => {
      const collected: Awaited<ReturnType<typeof listTickets>>['items'] = [];
      let skip = 0;
      let total = 0;
      do {
        const page = await listTickets({ objectId, skip, take: TICKETS_PAGE_SIZE });
        total = page.total;
        collected.push(...page.items);
        skip += page.items.length;
        // Пустая страница означает конец данных: без этой проверки цикл был бы
        // бесконечным при расхождении `total` и реальной выдачи.
      } while (collected.length < total && collected.length < MAX_AGGREGATED_TICKETS && skip > 0);
      return { items: collected, total };
    },
    enabled: Boolean(objectId) && enabled,
    staleTime: 60_000,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    truncated: (query.data?.total ?? 0) > (query.data?.items.length ?? 0),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Агрегат расхода материалов по объекту за период — единственный серверный отчёт. */
export function useConsumptionReport(
  objectId: string | undefined,
  period: Period,
  enabled: boolean,
) {
  return useQuery<ConsumptionReport>({
    queryKey: ['materials', 'report', objectId, period.from, period.to],
    queryFn: () => getConsumptionReport({ objectId, from: period.from, to: period.to }),
    enabled: Boolean(objectId) && enabled,
    staleTime: 60_000,
  });
}

/** Остатки ниже порога — информационный блок «Заканчивается на объекте». */
export function useLowStocks(objectId: string | undefined, enabled: boolean) {
  return useQuery<{ items: StockView[]; total: number }>({
    queryKey: ['materials', 'stocks', objectId, 'low'],
    queryFn: () => listStocks({ objectId, onlyLow: true }),
    enabled: Boolean(objectId) && enabled,
    staleTime: 60_000,
  });
}
