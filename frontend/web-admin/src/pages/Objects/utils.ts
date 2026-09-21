/**
 * Локальные помощники экранов «Объекты». Общие компоненты и API лежат вне этого
 * каталога и не правятся, поэтому форматирование и разбор ошибок живут здесь.
 */

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

/**
 * Сообщения NestJS: `{ message: string | string[] }`. Массивы от class-validator
 * приходят в виде `lat must not be greater than 90` — по имени поля в тексте
 * форма подсвечивает конкретный контрол.
 */
export function apiMessages(error: unknown): string[] {
  if (typeof error === 'object' && error !== null) {
    const { response } = error as { response?: { data?: { message?: unknown } } };
    const message = response?.data?.message;
    if (typeof message === 'string' && message.length > 0) return [message];
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string');
    }
  }
  if (error instanceof Error && error.message) return [error.message];
  return [];
}

export function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatInteger(value: number): string {
  return value.toLocaleString('ru-RU');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `dd.MM.yyyy HH:mm` — формат из спецификации карточки объекта. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Координаты: шесть знаков, как в паспорте объекта. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export function formatScale(scale: number): string {
  return `${scale.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} м/пкс`;
}

/**
 * Числовой контрол приходит строкой: `valueAsNumber` вернул бы NaN на промежуточном
 * вводе («55.», «-»), и поле очищалось бы прямо во время набора. Пустая строка —
 * «поле не заполнено», поэтому `undefined`, а не `NaN`.
 */
export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseRequiredNumber(raw: string): number {
  const parsed = parseOptionalNumber(raw);
  return parsed === undefined ? Number.NaN : parsed;
}

/** Телефон/email в паспорте — ссылка `tel:`/`mailto:`, если контакт распознан. */
export function contactLink(contact: string): { href: string; label: string } | null {
  const value = contact.trim();
  if (value.includes('@')) {
    return { href: `mailto:${value}`, label: value };
  }
  if (/^[+()\d\s-]+$/.test(value)) {
    return { href: `tel:${value.replace(/[^\d+]/g, '')}`, label: value };
  }
  return null;
}

/** Токен Mapbox не заявлен в `vite-env.d.ts` — читаем его без правки общих типов. */
export function mapboxToken(): string | undefined {
  const env = import.meta.env as unknown as { VITE_MAPBOX_TOKEN?: string };
  const token = env.VITE_MAPBOX_TOKEN;
  return token && token.length > 0 ? token : undefined;
}

/**
 * Распространённые типы объектов. Справочник ещё не утверждён (`Object.type` —
 * свободная строка), поэтому это подсказки в `<datalist>`, а не закрытый список.
 */
export const COMMON_OBJECT_TYPES = [
  'Бизнес-центр',
  'Торговый центр',
  'Офис',
  'Склад',
  'Производство',
  'Школа',
  'Больница',
  'Гостиница',
  'Жилой комплекс',
  'Магазин',
  'Аэропорт',
  'Вокзал',
  'Спортивный комплекс',
  'Бизнес-парк',
] as const;

/**
 * Как показывать заказчика объекта (карточка и список).
 *
 * Привязка — единственный авторитетный признак доступа заказчика к объекту
 * (портал открывает объект по `ownerClientId === id сессии`), поэтому в UI важно
 * различать четыре состояния, а не просто печатать `clientName`:
 *  - привязки нет → ручной `clientName` + метка «Без привязки»;
 *  - аккаунт найден и активен → `fullName (email)`;
 *  - аккаунт найден, но деактивирован → `fullName (email)` + «аккаунт деактивирован»;
 *  - аккаунт не резолвится (удалён/уже не CLIENT) → `clientName` + «аккаунт недоступен».
 */
export type OwnerClientState = 'bound' | 'unbound' | 'deactivated' | 'unresolved';

export interface OwnerClientCell {
  state: OwnerClientState;
  /** Основная строка: аккаунт либо ручное значение `clientName`. */
  primary: string;
  /** Вторая строка (контакт) — есть только у непривязанного объекта. */
  secondary: string | null;
  /** Метка состояния; `null` — показывать нечего (обычная привязка). */
  hint: string | null;
}

export function ownerClientCell(
  object: { clientName: string; clientContact: string; ownerClientId: string | null },
  clientsById: Map<string, { fullName: string; email: string; isActive: boolean }>,
): OwnerClientCell {
  if (object.ownerClientId === null) {
    return {
      state: 'unbound',
      primary: object.clientName,
      secondary: object.clientContact,
      hint: 'Без привязки',
    };
  }

  const account = clientsById.get(object.ownerClientId);
  if (!account) {
    return {
      state: 'unresolved',
      primary: object.clientName,
      secondary: object.clientContact,
      hint: 'аккаунт недоступен',
    };
  }

  return {
    state: account.isActive ? 'bound' : 'deactivated',
    primary: `${account.fullName} (${account.email})`,
    secondary: null,
    hint: account.isActive ? null : 'аккаунт деактивирован',
  };
}

/** Название этажа по умолчанию (спецификация: «{number} этаж»). */
export function defaultFloorName(number: number): string {
  return `${number} этаж`;
}

export const MAX_PLAN_BYTES = 10 * 1024 * 1024;

export const PLAN_ACCEPT = '.png,.jpg,.jpeg,.pdf,.svg,image/png,image/jpeg,image/svg+xml,application/pdf';

const PLAN_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'application/pdf',
];

/** Форматы и лимит 10 МБ задвоены на бэкенде (file-service) — здесь, чтобы не ждать 413. */
export function planFileError(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.svg'];
  const allowed = PLAN_MIME_TYPES.includes(file.type) || allowedExtensions.includes(extension);
  if (!allowed) return 'Допустимы только PNG, JPG, PDF или SVG';
  if (file.size > MAX_PLAN_BYTES) return 'Файл больше 10 МБ';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export function isImagePlan(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml';
}
