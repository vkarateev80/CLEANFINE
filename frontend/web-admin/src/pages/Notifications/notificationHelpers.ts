import {
  NOTIFICATION_TYPES,
  type NotificationEntity,
  type NotificationType,
  type NotificationsPage,
} from '../../types/notifications';

/**
 * Чистые помощники страницы «Уведомления» и тостера (07.11.2026, дефекты из
 * записи видеоинструкции: галочки подписок не переключались, «На странице» не
 * работал, тостер повторял старые непрочитанные).
 */

/**
 * Новый список отключённых типов после клика по галочке `type`.
 *
 * PATCH принимает только известные типы (`@IsIn(NOTIFICATION_TYPES)`), поэтому
 * список собирается из `NOTIFICATION_TYPES`, а не из ответа бэкенда (там string[]).
 * Раньше обе ветки условия добавляли тип, только если он уже был отключён, —
 * сервер получал тот же список и отвечал «Настройки сохранены» без изменений.
 */
export function toggleDisabledType(
  disabled: readonly string[],
  type: NotificationType,
): NotificationType[] {
  const disableNow = !disabled.includes(type);
  return NOTIFICATION_TYPES.filter((item) =>
    item === type ? disableNow : disabled.includes(item),
  );
}

/** Размеры страницы — как у общего `Pagination`; максимум бэкенда — 100. */
export const NOTIFICATION_PAGE_SIZES = [25, 50, 100] as const;

/** `?limit=` из URL: неизвестное значение — первый размер (25). */
export function pageSizeFromParam(raw: string | null): number {
  const value = Number(raw);
  return (NOTIFICATION_PAGE_SIZES as readonly number[]).includes(value)
    ? value
    : NOTIFICATION_PAGE_SIZES[0];
}

/**
 * Что тостер уже видел. `ids` — все непрочитанные, попадавшие в опрос;
 * `watermark` — самое позднее `createdAt` среди них (мс).
 */
export interface SeenNotifications {
  ids: Set<string>;
  watermark: number;
}

/**
 * Допуск на порядок вставки: два уведомления одному пользователю, созданные почти
 * одновременно, могут стать видны опросу не в порядке `createdAt`.
 */
const WATERMARK_SKEW_MS = 5_000;

function createdAtMs(item: NotificationEntity): number {
  const value = Date.parse(item.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

/** Первый ответ опроса: всё, что уже лежит в непрочитанных, — не новое. */
export function startSeen(page: NotificationsPage): SeenNotifications {
  const seen: SeenNotifications = { ids: new Set(), watermark: 0 };
  rememberSeen(seen, page);
  return seen;
}

function rememberSeen(seen: SeenNotifications, page: NotificationsPage): void {
  for (const item of page.items) {
    seen.ids.add(item.id);
    seen.watermark = Math.max(seen.watermark, createdAtMs(item));
  }
}

/**
 * Непрочитанные, появившиеся с прошлого опроса; `seen` обновляется на месте.
 *
 * Раньше «виденным» считался только самый новый id: после «Прочитано» на нём
 * первым на странице оказывалось старое непрочитанное, цикл не находил прежний id
 * и выдавал всю страницу как новую — со звуком. Теперь новым считается только
 * ещё не виденное и не старше отметки (минус допуск): старые непрочитанные,
 * поднявшиеся на первую страницу после прочтения новых, всплывать не должны.
 */
export function collectFresh(page: NotificationsPage, seen: SeenNotifications): NotificationEntity[] {
  const threshold = seen.watermark - WATERMARK_SKEW_MS;
  const fresh = page.items.filter(
    (item) => !seen.ids.has(item.id) && createdAtMs(item) >= threshold,
  );
  rememberSeen(seen, page);
  return fresh;
}
