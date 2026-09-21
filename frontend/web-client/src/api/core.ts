import { apiClient } from './client';
import type {
  ObjectDetail,
  ObjectEntity,
  PageQuery,
  Paginated,
} from '../types/core';

/**
 * Клиент core-service (:3003 через прокси `/api/objects`). Портал заказчика
 * читает объект, но никогда его не правит: `POST`/`PATCH`/`DELETE` в портале не
 * существует (DS-004, `overview.md` п. 2 — «Запрещено: правка объекта»).
 *
 * `listObjects` нужен для определения «своего объекта»: привязка — по
 * `ownerClientId` (id аккаунта заказчика), поэтому портал запрашивает
 * `listObjects({ ownerClientId: sessionUser.id })`
 * (см. `hooks/useObjectScope.ts`).
 */

/** Фильтры `GET /api/objects` (пагинация `skip`/`take`, `take` ≤ 100). */
export interface ListObjectsQuery extends PageQuery {
  status?: string;
  type?: string;
  search?: string;
  /**
   * Точное совпадение id аккаунта-владельца. Это фильтр списка, а не авторизация:
   * эндпоинт доступен любому аутентифицированному пользователю, серверный scope
   * вне объёма проекта (см. System Design §1/§14).
   */
  ownerClientId?: string;
}

export function listObjects(query: ListObjectsQuery = {}): Promise<Paginated<ObjectEntity>> {
  return apiClient.get('/objects', { params: query }).then((r) => r.data);
}

export function getObject(id: string): Promise<ObjectEntity> {
  return apiClient.get(`/objects/${id}`).then((r) => r.data);
}

/**
 * Объект с этажами и помещениями. Нужен только для счётчика помещений в паспорте
 * и для селекта «этаж → помещение» в форме заявки (DS-004, `dashboard.md` п. 4.2,
 * `tickets.md` п. 7.1).
 */
export function getObjectDetail(id: string): Promise<ObjectDetail> {
  return apiClient.get(`/objects/${id}/detail`).then((r) => r.data);
}
