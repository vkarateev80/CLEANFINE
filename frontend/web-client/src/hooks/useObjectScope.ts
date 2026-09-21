import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getObject, listObjects } from '../api/core';
import type { ObjectEntity } from '../types/core';
import type { SessionUser } from '../types';

/**
 * Определение «своего объекта» клиента.
 *
 * Привязка объекта к аккаунту — ЯВНАЯ: у `Object` есть `ownerClientId` (id
 * пользователя auth-service), и объект считается своим ровно тогда, когда
 * `ownerClientId === sessionUser.id`. Портал запрашивает свои объекты фильтром
 * `GET /api/objects?ownerClientId=<id>`.
 *
 * Здесь сознательно НЕТ сопоставления по имени (`clientName` ↔ `fullName`/`email`):
 * такая эвристика выдавала доступ по совпадению строк (тёзки, разное написание),
 * не отзывалась при переименовании и приводила к дефекту «Объект не подключён».
 * Возвращать её запасным путём нельзя — доступ обязан определяться только id.
 *
 * Ограничения, принятые осознанно:
 *  - серверного scope нет: `GET /api/objects` отдаёт объекты любому
 *    аутентифицированному пользователю, фильтр `ownerClientId` — фильтр списка,
 *    а не авторизация. Портал — UI-механика поверх существующего API;
 *  - если у клиента несколько объектов, открывается первый по возрастанию `id`
 *    (детерминированно, без многообъектного UX);
 *  - `take <= 100`, поэтому при >100 объектах выбор идёт по первой сотне.
 */

/** Состояние определения объекта. */
export type ScopeState =
  /** Объект найден и подтверждён запросом `GET /api/objects/:id`. */
  | 'ready'
  /** У аккаунта нет ни одного привязанного объекта → «Объект не подключён». */
  | 'unassigned'
  /** В URL передан чужой `objectId` → экран «Нет доступа к объекту». */
  | 'forbidden'
  /** Список объектов грузится. */
  | 'loading'
  /** Список объектов не удалось получить (сеть/5xx). */
  | 'error';

export interface ObjectScope {
  state: ScopeState;
  object: ObjectEntity | null;
  /** Почему объект считается своим — показывается в отладке и в README. */
  reason: string | null;
  /** `objectId` из query-строки, не совпавший со своим объектом. */
  requestedId: string | null;
  /** ADMIN смотрит объект по `?debugObjectId=` — режим отладки, не рабочий сценарий. */
  isDebug: boolean;
  /** Ошибка загрузки списка объектов (для `ErrorBanner`). */
  error: unknown;
  refetch: () => void;
}

const QUERY_KEY = ['object-scope', 'objects'] as const;

/** Сколько объектов запрашиваем (лимит API — 100). */
const OBJECTS_TAKE = 100;

/**
 * Определение объекта сессии и проверка scope.
 *
 * `requestedId` приходит из query-строки. Он **сужает** доступ, но никогда его не
 * расширяет: значение из URL не может стать «своим» объектом. Если оно не
 * совпадает с определённым объектом — состояние `forbidden` («Нет доступа к
 * объекту»), а не молчаливое игнорирование: пользователь должен видеть, что
 * попытка открыть чужой объект отклонена (DS-004, `dashboard.md` п. 6).
 */
export function useObjectScope(user: SessionUser | null): ObjectScope {
  const [params] = useSearchParams();
  const requestedId = params.get('objectId');
  const debugObjectId = params.get('debugObjectId');

  const isAdmin = user?.role === 'ADMIN';
  // Отладочный выбор объекта разрешён только ADMIN: у клиента роль CLIENT, и
  // параметр для него — обычный query-шум, который не даёт ничего.
  const debug = isAdmin && Boolean(debugObjectId);

  const userId = user?.id ?? '';

  // Свои объекты — только по явной привязке к аккаунту.
  const listQuery = useQuery({
    queryKey: [...QUERY_KEY, userId],
    queryFn: () => listObjects({ ownerClientId: userId, take: OBJECTS_TAKE }),
    enabled: Boolean(user) && userId !== '' && !debug,
    // Список объектов для привязки: тот же приём, что у списков админки
    // (staleTime 30 с), но с refetch при возврате в браузер телефона.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Отладочный объект грузится напрямую по id: админ не проходит фильтр по
  // `ownerClientId` (у него нет привязанных объектов) и без этого не увидел бы
  // портал вообще.
  const debugQuery = useQuery({
    queryKey: ['object-scope', 'debug', debugObjectId],
    queryFn: () => getObject(debugObjectId as string),
    enabled: debug,
    staleTime: 30_000,
  });

  const resolved = useMemo<{ object: ObjectEntity | null; reason: string | null }>(() => {
    if (debug) {
      return {
        object: debugQuery.data ?? null,
        reason: debugQuery.data ? 'выбран администратором (?debugObjectId)' : null,
      };
    }
    if (!user || !listQuery.data) {
      return { object: null, reason: null };
    }
    // Сортировка по `id`, а не по порядку ответа API: выбор не должен «плавать»
    // между запросами, если объектов у аккаунта несколько.
    const own = [...listQuery.data.items].sort((left, right) => left.id.localeCompare(right.id));
    if (own.length === 0) {
      return { object: null, reason: null };
    }
    return { object: own[0], reason: `ownerClientId = ${user.id}` };
  }, [debug, debugQuery.data, listQuery.data, user]);

  const mismatch = Boolean(
    requestedId && resolved.object && requestedId !== resolved.object.id,
  );

  let state: ScopeState;
  if (debug) {
    state = debugQuery.isLoading ? 'loading' : debugQuery.isError ? 'error' : 'ready';
  } else if (!user) {
    state = 'loading';
  } else if (listQuery.isLoading) {
    state = 'loading';
  } else if (listQuery.isError) {
    state = 'error';
  } else {
    state = resolved.object ? 'ready' : 'unassigned';
  }
  // Чужой `objectId` в URL важнее прочих состояний: показываем отказ, а не
  // «объект не подключён» (иначе причина отказа читалась бы неверно).
  if (mismatch) state = 'forbidden';

  return {
    state,
    object: state === 'ready' ? resolved.object : null,
    reason: resolved.reason,
    requestedId: mismatch ? requestedId : null,
    isDebug: debug,
    error: debug ? debugQuery.error : listQuery.error,
    refetch: () => {
      if (debug) void debugQuery.refetch();
      else void listQuery.refetch();
    },
  };
}
