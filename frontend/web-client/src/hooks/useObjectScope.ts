import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getObject, listObjects } from '../api/core';
import type { ObjectEntity } from '../types/core';
import type { SessionUser } from '../types';

/**
 * Определение «своего объекта» клиента — узкое место М5.4.
 *
 * В `backend/auth-service/prisma/schema.prisma` у `model User` НЕТ ссылки на
 * объект (`objectId`/`clientId`), а `GET /api/objects` не фильтрует объекты по
 * роли. Поэтому «свой объект» портал выводит из данных core-service: у `Object`
 * есть строковое поле `clientName`, и объект считается своим, если это имя
 * совпадает с идентификатором пользователя — ФИО или email из `GET /api/auth/me`.
 *
 * Правила сопоставления (детерминированные, чтобы результат не «плавал» от
 * порядка ответа API):
 *   1. точное совпадение нормализованных строк (регистр, лишние пробелы);
 *   2. иначе — вхождение одной строки в другую (`clientName` «ООО Ромашка» и
 *      ФИО «Ромашка» — частый случай, когда заказчик заведён контактом);
 *   3. если кандидатов несколько — берётся первый по возрастанию `id` (сортировка
 *      по `id`, а не по порядку выдачи: иначе выбор менялся бы между запросами).
 *
 * Честное ограничение: сопоставление по имени — эвристика, а не привязка в БД.
 * Оно не различает тёзок и не работает, если в `clientName` записано не название
 * организации клиента. Это **не** замена серверному scope: если бэкенд отдаёт
 * данные чужого объекта, дефект на стороне бэкенда (см. README и отчёт М5.4).
 */

/** Состояние определения объекта. */
export type ScopeState =
  /** Объект найден и подтверждён запросом `GET /api/objects/:id`. */
  | 'ready'
  /** Ни один объект не сопоставлен клиенту → «Объект не подключён». */
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

/** Нормализация имени: регистр, крайние пробелы, повторные пробелы, кавычки-ёлочки. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Идентификаторы пользователя, которыми можно сопоставить `Object.clientName`. */
export function identityCandidates(user: SessionUser): string[] {
  // email тоже участвует: заказчик мог быть заведён по адресу почты.
  return [user.fullName, user.email].map(normalizeName).filter((value) => value !== '');
}

/**
 * Совпадение имени объекта с одним из идентификаторов пользователя.
 * Возвращает текст-объяснение либо `null` — чтобы причина попадала в UI отладки,
 * а не оставалась «магией» внутри условия.
 */
export function matchObject(
  object: ObjectEntity,
  identities: string[],
): string | null {
  const client = normalizeName(object.clientName);
  if (client === '') return null;
  if (identities.includes(client)) {
    return `точное совпадение «${object.clientName}»`;
  }
  const partial = identities.find(
    (identity) => client.includes(identity) || identity.includes(client),
  );
  return partial ? `частичное совпадение «${object.clientName}»` : null;
}

/** Кандидаты «своего объекта»: отсортированы по `id` — выбор не зависит от порядка API. */
export function findOwnObjects(objects: ObjectEntity[], identities: string[]): ObjectEntity[] {
  return objects
    .filter((object) => matchObject(object, identities) !== null)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
}

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

  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listObjects({ take: 100 }),
    enabled: Boolean(user) && !debug,
    // Список объектов для привязки: тот же приём, что у списков админки
    // (staleTime 30 с), но с refetch при возврате в браузер телефона.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Отладочный объект грузится напрямую по id: админ не проходит сопоставление
  // по `clientName` (у него нет названия организации) и без этого не увидел бы
  // портал вообще.
  const debugQuery = useQuery({
    queryKey: ['object-scope', 'debug', debugObjectId],
    queryFn: () => getObject(debugObjectId as string),
    enabled: debug,
    staleTime: 30_000,
  });

  const identities = useMemo(() => (user ? identityCandidates(user) : []), [user]);

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
    const candidates = findOwnObjects(listQuery.data.items, identities);
    if (candidates.length === 0) {
      return { object: null, reason: null };
    }
    const object = candidates[0];
    return { object, reason: matchObject(object, identities) };
  }, [debug, debugQuery.data, identities, listQuery.data, user]);

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
