import { useCallback, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { listTickets } from '../../api/tickets';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import type { TicketListItem } from '../../types/tickets';

/**
 * Лента заявок объекта с фильтром-чипами и догрузкой «Показать ещё».
 *
 * Почему не клиентская фильтрация одной страницы: `reports.md`/`tickets.md`
 * требуют серверную пагинацию (`skip`/`take`), иначе на объекте с сотнями заявок
 * список молча показывал бы только первую сотню. Поэтому фильтр — это набор
 * статусов, а на каждый статус идёт свой запрос (в `ListTicketsQueryDto` `status`
 * один — открытый вопрос `tickets.md` п. 10.4).
 *
 * `take = 20` вместо 50 админки: меньше трафика на мобильной сети (DS-004,
 * `overview.md` п. 6.2).
 */

export const TICKETS_PAGE_SIZE = 20;

/** Группы статусов фильтр-чипов (`tickets.md` п. 4.2). */
export const TICKET_FILTERS = {
  all: null,
  open: ['new', 'assigned', 'in_progress', 'paused', 'overdue'],
  done: ['completed', 'verified', 'closed'],
  rejected: ['rejected'],
} satisfies Record<string, TicketStatus[] | null>;

export type TicketFilterKey = keyof typeof TICKET_FILTERS;

export const TICKET_FILTER_LABELS: Record<TicketFilterKey, string> = {
  all: 'Все',
  open: 'Открытые',
  done: 'Выполненные',
  rejected: 'Отклонённые',
};

export interface TicketsFeed {
  items: TicketListItem[];
  total: number;
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export function useTicketsFeed(objectId: string | undefined, filter: TicketFilterKey): TicketsFeed {
  // `take` растёт при догрузке: страницы не склеиваются вручную, а запрашиваются
  // заново с увеличенным размером. Это осознанный компромисс: `skip` для набора
  // из нескольких статусов пришлось бы двигать синхронно по каждому запросу, а
  // «показать ещё» на телефоне нажимают редко — лишний трафик незаметен, зато
  // нет риска «дыр» и дублей в списке.
  const [take, setTake] = useState(TICKETS_PAGE_SIZE);
  const statuses = TICKET_FILTERS[filter];

  const results = useQueries({
    queries: (statuses ?? [null]).map((status) => ({
      queryKey: ['tickets', 'feed', objectId, filter, status, take],
      queryFn: () => listTickets({ objectId, status: status ?? undefined, take }),
      enabled: Boolean(objectId),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    })),
  });

  // Данные запросов в виде массива: зависимость `useMemo` — ссылки на страницы,
  // а не объекты результатов (они пересоздаются на каждом рендере и ломали бы
  // мемоизацию, заставляя список пересортировываться на каждом нажатии).
  const pages = results.map((result) => result.data);

  const items = useMemo(() => {
    const collected: TicketListItem[] = [];
    for (const page of pages) {
      if (page) collected.push(...page.items);
    }
    const unique = new Map(collected.map((ticket) => [ticket.id, ticket]));
    return Array.from(unique.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }, [pages]);

  const total = results.reduce((sum, result) => sum + (result.data?.total ?? 0), 0);

  const loadMore = useCallback(() => {
    setTake((current) => current + TICKETS_PAGE_SIZE);
  }, []);

  const refetch = useCallback(() => {
    setTake(TICKETS_PAGE_SIZE);
    for (const result of results) void result.refetch();
  }, [results]);

  return {
    items,
    total,
    isLoading: results.some((result) => result.isLoading),
    isFetchingMore:
      results.some((result) => result.isFetching) && !results.some((r) => r.isLoading),
    isError: results.some((result) => result.isError),
    error: results.find((result) => result.isError)?.error ?? null,
    hasMore: items.length < total,
    loadMore,
    refetch,
  };
}
