import type { ReactNode } from 'react';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import { Badge } from '../../components/ui';
import { TICKET_STATUS_LABELS } from '../../types/tickets';

/**
 * Ширина выпадающего списка в ряду фильтров.
 *
 * Почему обёртка, а не `className="w-48"` на самом `Select`: контрол в UI-ките
 * собран как `CONTROL + className`, а `CONTROL` содержит `w-full`. Утилиты
 * `.w-full` и `.w-48` одинаковы по специфичности, поэтому побеждает объявленная
 * позже в собранном CSS — и `w-48` не срабатывает: выпадающие списки растягиваются
 * на всю строку и встают по одному в ряд. Ширину задаёт обёртка, а `w-full`
 * контрола заполняет уже её (та же картина, что на экране «Объекты»).
 */
export function FilterSlot({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`shrink-0 ${width}`}>{children}</div>;
}

/**
 * Помощники экранов «Заявки». Тон и подписи статусов — здесь, чтобы таблица,
 * карточка и фильтры показывали статус одинаково (тот же приём, что
 * `ObjectStatusBadge` в `components/ui/Badge`).
 */

type Tone = 'success' | 'warning' | 'neutral' | 'danger' | 'info';

const TONES: Record<TicketStatus, Tone> = {
  new: 'info',
  assigned: 'warning',
  in_progress: 'warning',
  paused: 'neutral',
  completed: 'success',
  verified: 'success',
  rejected: 'danger',
  closed: 'neutral',
  overdue: 'danger',
};

const PRIORITY_TONES: Record<string, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  critical: 'danger',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={TONES[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}

/** Приоритет: словарь приходит из shared, но тон нужен только интерфейсу. */
export function TicketPriorityBadge({ priority, label }: { priority: string; label: string }) {
  return <Badge tone={PRIORITY_TONES[priority] ?? 'neutral'}>{label}</Badge>;
}

/** Короткий вид UUID: полный id в таблице нечитаем, полный — в карточке. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** `dd.MM.yyyy HH:mm` — формат дат в админке (тот же, что в карточке объекта). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Относительное «просрочено/осталось» по дедлайну — подсказка в паспорте заявки. */
export function deadlineHint(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  if (minutes < 1) return 'сейчас';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const human = hours > 0 ? `${hours} ч ${rest} мин` : `${minutes} мин`;
  return diffMs < 0 ? `просрочен на ${human}` : `осталось ${human}`;
}

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}
