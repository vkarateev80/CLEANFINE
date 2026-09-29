import { useQueries, useQuery } from '@tanstack/react-query';
import { listTickets } from '../api/tickets';
import { listEvents } from '../api/schedule';
import { listMyChats } from '../api/chat';
import { listNotifications } from '../api/notifications';
import { todayUtc } from '../lib/format';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import type { TicketListItem } from '../types/tickets';
import type { ScheduleEventEntity } from '../types/schedule';

/**
 * Данные главного экрана (`/dashboard`) и общие для портала выборки.
 *
 * Разделение на «один запрос на объект» и «KPI» сделано намеренно: у каждого
 * блока свой `ErrorBanner` с «Повторить», поэтому частичный сбой не гасит экран
 * целиком (приём `object_detail.md` п. 6, повторён в DS-004 `dashboard.md` п. 6).
 */

/** Статусы «открытой» заявки — те, по которым клиент ждёт работу. */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  'new',
  'assigned',
  'in_progress',
  'paused',
  'overdue',
];

/** Статусы «выполненной» заявки. */
export const DONE_TICKET_STATUSES: TicketStatus[] = ['completed', 'verified', 'closed'];

/** Ссылка на список заявок с фильтром — используется KPI-плитками главной. */
export const TICKETS_FILTER_PATH: Record<'open' | 'done', string> = {
  open: '/tickets?status=open',
  done: '/tickets?status=done',
};

const LIST_OPTIONS = {
  // 30 с, как у списков админки: на телефоне это компромисс между свежестью и
  // трафиком мобильной сети (DS-004, `overview.md` п. 6.4).
  staleTime: 30_000,
  refetchOnWindowFocus: true,
} as const;

/**
 * Число заявок в указанных статусах.
 *
 * `ListTicketsQueryDto` принимает ОДИН `status`, списка статусов в контракте нет
 * (открытый вопрос `tickets.md` п. 10.4). Поэтому счётчик «открытые» — это N
 * параллельных запросов с `take=1` и суммирование `total`: `take=1` делает каждый
 * запрос дешёвым, а TanStack Query выполняет их параллельно.
 */
export function useTicketCounts(objectId: string | undefined, statuses: TicketStatus[]) {
  const results = useQueries({
    queries: statuses.map((status) => ({
      queryKey: ['tickets', 'count', objectId, status],
      queryFn: () => listTickets({ objectId, status, take: 1 }),
      enabled: Boolean(objectId),
      ...LIST_OPTIONS,
    })),
  });

  return {
    total: results.reduce((sum, result) => sum + (result.data?.total ?? 0), 0),
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch()),
  };
}

/**
 * Последние заявки объекта (главная: 5 последних; список: страница).
 *
 * Сортировки в API нет, поэтому «последние» собираются по `createdAt` на клиенте
 * — тем же способом, что и в списке заявок.
 */
export function useRecentTickets(objectId: string | undefined, take = 5) {
  return useQuery({
    queryKey: ['tickets', 'list', objectId, { skip: 0, take }],
    queryFn: () => listTickets({ objectId, skip: 0, take }),
    enabled: Boolean(objectId),
    ...LIST_OPTIONS,
  });
}

/** Смены объекта начиная с указанной даты (по умолчанию — сегодня UTC). */
export function useUpcomingEvents(objectId: string | undefined, from: string = todayUtc()) {
  return useQuery({
    queryKey: ['schedule', 'events', objectId, { from }],
    queryFn: () => listEvents({ objectId, date: from }),
    enabled: Boolean(objectId),
    ...LIST_OPTIONS,
  });
}

/**
 * Непрочитанные сообщения менеджера. Источник — chat-service (`unreadCount` из
 * списка своих чатов), потому что портал открывает DIRECT-чат и должен показывать
 * счётчик до того, как пользователь зашёл в переписку.
 */
export function useUnreadMessages(enabled = true) {
  const query = useQuery({
    queryKey: ['chat', 'chats'],
    queryFn: listMyChats,
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const direct = (query.data ?? []).filter((chat) => chat.type === 'direct');
  return {
    total: direct.reduce((sum, chat) => sum + chat.unreadCount, 0),
    // Заглушка «сервис чата недоступен»: по этой ошибке экран чата переходит в
    // режим «только история» (DS-004, `chat.md` п. 6).
    isUnavailable: query.isError,
    isLoading: query.isLoading,
    chats: direct,
    refetch: query.refetch,
  };
}

/**
 * Непрочитанные уведомления как резервный источник счётчика.
 *
 * Основной источник — chat-service; notification-service нужен, если чат ещё не
 * создан (М5.1 до первого сообщения), а менеджер уже прислал уведомление.
 */
export function useUnreadNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => listNotifications({ unreadOnly: true, limit: 1 }),
    enabled,
    staleTime: 30_000,
  });
}

/** Сортировка заявок «свежие сверху»: серверного `orderBy` в контракте нет. */
export function sortTicketsByDate(items: TicketListItem[]): TicketListItem[] {
  return items.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Ближайшие смены: только будущие и не завершённые, отсортированы по `plannedStart`. */
export function upcomingShifts(
  events: ScheduleEventEntity[],
  nowIso: string,
): ScheduleEventEntity[] {
  return events
    .filter((event) => event.status === 'PLANNED' || event.status === 'CHECKED_IN')
    .filter((event) => event.plannedStart >= nowIso)
    .slice()
    .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart));
}

/** Ближайшая смена объекта либо `null` — для паспорта и KPI-плитки главной. */
export function nextShift(
  events: ScheduleEventEntity[],
  nowIso: string,
): ScheduleEventEntity | null {
  return upcomingShifts(events, nowIso)[0] ?? null;
}

/** Последняя завершённая смена (по `checkOutAt`) — «последняя уборка» в паспорте. */
export function lastCompletedShift(events: ScheduleEventEntity[]): ScheduleEventEntity | null {
  const completed = events
    .filter((event) => event.status === 'CHECKED_OUT' && event.checkOutAt)
    .slice()
    .sort((left, right) => (right.checkOutAt ?? '').localeCompare(left.checkOutAt ?? ''));
  return completed[0] ?? null;
}
