import { useQuery } from '@tanstack/react-query';
import { getObjectDetail, getRoom, getTechCard, listObjects } from '../../api/core';
import { getTicket, listTickets } from '../../api/tickets';
import { listUsers } from '../../api/users';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import type { SessionUser } from '../../types';
import type { ListTicketsQuery } from '../../types/tickets';

/**
 * Данные экранов «Заявки». Хуки собирают и кэшируют справочники, которые нужны
 * нескольким экранам (объекты, помещения, сотрудники), чтобы список и карточка
 * не делали одних и тех же запросов.
 *
 * Справочник сотрудников доступен только ADMIN/SUPERVISOR (`@Roles` в
 * auth-service), поэтому запрос включается по правам: у оператора и заказчика он
 * вернул бы 403 и «красный» баннер на списке заявок.
 */

/** Максимум `take` на бэкендах — 100; больше в один запрос не попросить. */
export const MAX_TAKE = 100;

/** Список заявок с фильтрами (`skip`/`take` — соглашение сервисов). */
export function useTickets(query: ListTicketsQuery) {
  return useQuery({
    queryKey: ['tickets', query],
    queryFn: () => listTickets(query),
    // При смене фильтра старые строки остаются на месте — таблица не «прыгает».
    placeholderData: (previous) => previous,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id as string),
    enabled: Boolean(id),
  });
}

/** Объекты для фильтра и формы создания: первая сотня. */
export function useObjectOptions() {
  return useQuery({
    queryKey: ['ticket-objects'],
    queryFn: () => listObjects({ skip: 0, take: MAX_TAKE }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Помещения объекта одним запросом: `GET /objects/:id/detail` уже содержит
 * этажи с помещениями, поэтому запрашивать этажи по одному не нужно.
 */
export function useObjectRooms(objectId: string | null | undefined) {
  return useQuery({
    queryKey: ['ticket-object-rooms', objectId],
    enabled: Boolean(objectId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const detail = await getObjectDetail(objectId as string);
      return detail.floors.flatMap((floor) => floor.rooms.map((room) => ({ room, floor })));
    },
  });
}

/** Помещение заявки (нужно, чтобы дойти до техкарты и её операций). */
export function useTicketRoom(roomId: string | null | undefined) {
  return useQuery({
    queryKey: ['ticket-room', roomId],
    enabled: Boolean(roomId),
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getRoom(roomId as string),
  });
}

/** Техкарта помещения заявки — источник списка операций для блока «Операции». */
export function useRoomTechCard(techCardId: string | null | undefined) {
  return useQuery({
    queryKey: ['ticket-tech-card', techCardId],
    enabled: Boolean(techCardId),
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getTechCard(techCardId as string),
  });
}

/** Справочник исполнителей (SUPERVISOR + OPERATOR). Только для ADMIN/SUPERVISOR. */
export function useAssigneeOptions() {
  const allowed = useCanAssignTicket();
  return useQuery({
    queryKey: ['ticket-assignees'],
    enabled: allowed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [supervisors, operators] = await Promise.all([
        listUsers({ role: 'SUPERVISOR', isActive: true, take: MAX_TAKE }),
        listUsers({ role: 'OPERATOR', isActive: true, take: MAX_TAKE }),
      ]);
      return {
        supervisors: supervisors.items,
        operators: operators.items,
        items: [...supervisors.items, ...operators.items],
      };
    },
  });
}

/** Имя сотрудника по id: карточки хранят только id (FK между сервисами нет). */
export function userName(users: SessionUser[] | undefined, id: string | null): string | null {
  if (!id) return null;
  const found = users?.find((user) => user.id === id);
  return found?.fullName ?? null;
}
