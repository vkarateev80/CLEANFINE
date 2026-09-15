import { Link } from 'react-router-dom';
import type { TicketStatus } from '@cleaning-ops/shared/types/tickets';
import type { ScheduleEventStatus } from '@cleaning-ops/shared/types/schedule';
import { Badge } from '../ui/Badge';
import { SCHEDULE_EVENT_STATUS_LABELS } from '../../types/schedule';
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketListItem } from '../../types/tickets';
import { formatDateTimeShort, plural, shortId } from '../../lib/format';

/**
 * Бейдж статуса заявки. Тон — представление экрана, подпись — словарь домена
 * (`TICKET_STATUS_LABELS`): добавится статус в shared — компилятор потребует тон
 * и подпись, и экран не покажет сырое `in_progress`.
 */
const TICKET_TONES: Record<TicketStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  new: 'info',
  assigned: 'warning',
  in_progress: 'warning',
  paused: 'neutral',
  completed: 'success',
  verified: 'success',
  closed: 'success',
  rejected: 'danger',
  overdue: 'danger',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={TICKET_TONES[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}

/**
 * Бейдж статуса смены. Значения — ВЕРХНИЙ регистр (`SCHEDULE_EVENT_STATUSES`:
 * PLANNED/CHECKED_IN/CHECKED_OUT/MISSED), а не `planned` из текстовой
 * спецификации: источник истины — prisma-схема schedule-service и shared-словарь,
 * который с ней сверяется юнит-тестом сервиса.
 */
const EVENT_TONES: Record<ScheduleEventStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  PLANNED: 'info',
  CHECKED_IN: 'warning',
  CHECKED_OUT: 'success',
  MISSED: 'danger',
};

export function EventStatusBadge({ status }: { status: ScheduleEventStatus }) {
  return <Badge tone={EVENT_TONES[status]}>{SCHEDULE_EVENT_STATUS_LABELS[status]}</Badge>;
}

/** Мета-строка карточки: «Внеплановая · 3 комментария · 2 из 4 операций». */
function ticketMeta(ticket: TicketListItem): string {
  const parts: string[] = [TICKET_TYPE_LABELS[ticket.type]];
  const comments = ticket._count?.comments ?? 0;
  if (comments > 0) {
    parts.push(`${comments} ${plural(comments, 'комментарий', 'комментария', 'комментариев')}`);
  }
  const total = ticket.operationsTotal ?? 0;
  const done = ticket._count?.operations ?? 0;
  if (total > 0) {
    parts.push(`${done} из ${total} операций`);
  }
  return parts.join(' · ');
}

/**
 * Карточка заявки — мобильная замена таблицы админки (DS-004, `tickets.md` п. 4.3).
 *
 * ФИО исполнителя не выводим: в ответе только `assigneeId` (UUID), а справочник
 * `/api/users` закрыт для роли CLIENT — показываем факт «исполнитель назначен».
 */
export function TicketCard({ ticket }: { ticket: TicketListItem }) {
  const overdue = ticket.overdueAt !== null;

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-primary-500"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-neutral-400" title={ticket.id}>
          {shortId(ticket.id)}
        </span>
        <TicketStatusBadge status={ticket.status} />
        <span className="font-mono text-xs text-neutral-500">
          {formatDateTimeShort(ticket.createdAt)}
        </span>
      </div>

      <p className="line-clamp-2 text-sm text-neutral-900" title={ticket.description}>
        {ticket.description}
      </p>

      <p className="text-xs text-neutral-500">{ticketMeta(ticket)}</p>

      {overdue && (
        <p className="text-xs text-danger-600">Просрочена с {formatDateTimeShort(ticket.overdueAt)}</p>
      )}

      {ticket.assigneeId && <p className="text-xs text-neutral-400">Исполнитель назначен</p>}
    </Link>
  );
}
