import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { MOVEMENT_TYPE_LABELS, type MovementType } from '../../types/materials';

/**
 * Локальные помощники экрана «Материалы» (М4.3): форматирование, разбор ошибок
 * axios, бейджи домена и запись фильтров в query-строку. Общий UI-кит живёт в
 * `components/ui` и здесь не дублируется.
 */

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `dd.MM.yyyy` — формат периодов и дат в таблицах. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** `dd.MM.yyyy HH:mm` — движения: время в пределах суток важно (приход/расход). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Количество материала: до трёх знаков. Нормы расхода дробные (0.05 л), но
 * «100.000 л» читается хуже, чем «100 л», поэтому лишние нули не показываем.
 */
export function formatQuantity(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/** Стоимость: всегда два знака — это деньги, а не измерение. */
export function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Короткий id для ссылок на чужие сервисы (объект, заявка, пользователь). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Числовой контрол приходит строкой: `valueAsNumber` вернул бы `NaN` на
 * промежуточном вводе («0.», «-»), и поле очищалось бы прямо во время набора.
 * Пустая строка — «поле не заполнено», поэтому `undefined`, а не `NaN`
 * (то же решение, что в `pages/Objects/utils.ts`).
 */
export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseRequiredNumber(raw: string): number {
  const parsed = parseOptionalNumber(raw);
  return parsed === undefined ? Number.NaN : parsed;
}

/**
 * Автор движения. `system:auto-consumption` пишет консьюмер автосписания (М4.2),
 * и показывать его как «пользователя» бессмысленно — читаем как «Система».
 */
export function movementAuthor(userId: string): string {
  return userId === 'system:auto-consumption' ? 'Автосписание' : shortId(userId);
}

// ── Бейджи домена ──────────────────────────────────────────────────────────

const MOVEMENT_TONES: Record<MovementType, 'success' | 'danger' | 'info' | 'warning'> = {
  IN: 'success',
  OUT: 'danger',
  TRANSFER: 'info',
  WRITE_OFF: 'warning',
};

/** Тип движения: подпись из shared-словаря, тон — представление экрана. */
export function MovementTypeBadge({ type }: { type: MovementType }) {
  return <Badge tone={MOVEMENT_TONES[type]}>{MOVEMENT_TYPE_LABELS[type]}</Badge>;
}

/** Уровень остатка. Признак приходит с бэкенда (`belowThreshold`), не считается на клиенте. */
export function StockLevelBadge({ belowThreshold }: { belowThreshold: boolean }) {
  return (
    <Badge tone={belowThreshold ? 'danger' : 'success'}>
      {belowThreshold ? 'Ниже порога' : 'В норме'}
    </Badge>
  );
}

// ── Фильтры в query-строке ─────────────────────────────────────────────────

/**
 * Запись фильтров в URL. Фильтры экрана живут в query-строке, как в списке
 * объектов и заявок: ссылку на конкретный отбор можно передать коллеге, а
 * возврат назад восстанавливает состояние. Ключи у вкладок разные
 * (`stock…`, `mv…`, `rp…`, `cat…`), поэтому панели не перетирают друг друга.
 */
export function useParamWriter() {
  const [, setParams] = useSearchParams();

  return useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
}
