import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorBanner, SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { TicketStatusBadge } from '../../components/tickets/TicketBadges';
import { addTicketComment, getTicket } from '../../api/tickets';
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from '../../types/tickets';
import { formatDate, formatDateTime, formatNumber, plural, shortId } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { apiStatus } from '../../lib/http';

/**
 * Карточка одной заявки `/tickets/:id` (DS-004, `tickets.md` п. 7.2).
 *
 * Экран добавлен потому, что без него клиент не видит статус своей заявки, а
 * ссылки на заявку приходят из чата и уведомлений (в М5.4 маршрут помечен как
 * предложение — см. `design/screens/web-client/README.md`).
 *
 * Действий клиента здесь два: прочитать и уточнить комментарием. Смены статуса,
 * назначения исполнителя и закрытия нет — на бэкенде они закрыты `@Roles`, а на
 * экране их просто не существует.
 *
 * 403 и 404 **не различаем**: одно сообщение «Заявка не найдена или доступна
 * только по вашему объекту» — иначе экран стал бы способом проверить
 * существование чужих заявок (`tickets.md` п. 6).
 */
export function TicketDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [comment, setComment] = useState('');

  const ticket = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
    enabled: Boolean(id),
    retry: false,
  });

  const status = apiStatus(ticket.error);
  const unavailable = ticket.isError && (status === 403 || status === 404);

  // Чужая/удалённая заявка: показываем сообщение в списке, а не «ошибку сети» —
  // повтор не изменит ответ.
  useEffect(() => {
    if (unavailable) {
      const timer = window.setTimeout(() => navigate('/tickets', { replace: true }), 2500);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [navigate, unavailable]);

  const commentMutation = useMutation({
    mutationFn: (text: string) => addTicketComment(id, text),
    onSuccess: () => {
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = comment.trim();
    if (text === '') return;
    commentMutation.mutate(text);
  }

  if (unavailable) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorBanner error={new Error('Заявка не найдена или доступна только по вашему объекту')} />
        <EmptyState
          title="Заявка недоступна"
          hint="Возвращаемся к списку заявок…"
          action={
            <Button variant="secondary" onClick={() => navigate('/tickets', { replace: true })}>
              К списку заявок
            </Button>
          }
        />
      </div>
    );
  }

  if (ticket.isError) {
    return <ErrorBanner error={ticket.error} onRetry={() => void ticket.refetch()} />;
  }

  if (ticket.isLoading || !ticket.data) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-200" />
        <div className="h-32 animate-pulse rounded-xl bg-neutral-200" />
        <div className="h-24 animate-pulse rounded-xl bg-neutral-200" />
      </div>
    );
  }

  const data = ticket.data;

  // Таймлайн жизненного цикла: показываем только шаги, у которых есть время.
  const timeline: Array<{ label: string; at: string | null }> = [
    { label: 'Создана', at: data.createdAt },
    { label: TICKET_STATUS_LABELS.assigned, at: data.assignedAt },
    { label: 'Исполнитель выехал', at: data.arrivedAt },
    { label: 'Принята в работу', at: data.acceptedAt },
    { label: TICKET_STATUS_LABELS.completed, at: data.completedAt },
    { label: TICKET_STATUS_LABELS.verified, at: data.verifiedAt },
    { label: TICKET_STATUS_LABELS.closed, at: data.closedAt },
    { label: TICKET_STATUS_LABELS.overdue, at: data.overdueAt },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="portal-ticket-detail">
      <div className="flex flex-col gap-1">
        <Link to="/tickets" className="text-xs text-neutral-500 hover:text-primary-600">
          ← Заявки
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-neutral-900">
            Заявка <span className="font-mono text-base">{shortId(data.id)}</span>
          </h1>
          <TicketStatusBadge status={data.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="font-mono">{formatDateTime(data.createdAt)}</span>
          <Badge tone="neutral">{TICKET_PRIORITY_LABELS[data.priority]}</Badge>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-900">Описание</h2>
        {/* Переносы строк сохраняем: клиент описывает проблему построчно. */}
        <p className="whitespace-pre-wrap text-sm text-neutral-900">{data.description}</p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">Ход работы</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Операций выполнено:{' '}
          <span className="font-mono">
            {formatNumber(data.operationsCompleted)}
            {data.operationsTotal ? ` из ${formatNumber(data.operationsTotal)}` : ''}
          </span>
        </p>
        <ol className="flex flex-col gap-2">
          {timeline
            .filter((step) => step.at !== null)
            .map((step) => (
              <li key={step.label} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-success-500" aria-hidden="true" />
                <span className="text-sm text-neutral-900">{step.label}</span>
                <span className="font-mono text-xs text-neutral-500">
                  {formatDateTime(step.at)}
                </span>
              </li>
            ))}
        </ol>
        {timeline.filter((step) => step.at !== null).length <= 1 && (
          <p className="mt-2 text-xs text-neutral-400">
            Заявка принята и ждёт назначения исполнителя.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">Переписка</h2>
        {data.comments.length === 0 ? (
          <p className="text-sm text-neutral-500">Комментариев пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.comments.map((item) => {
              const mine = item.authorId === currentUserId;
              return (
                <li key={item.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {/* ФИО не показываем: справочник `/api/users` закрыт для CLIENT. */}
                    <span className="text-xs font-medium text-neutral-700">
                      {mine ? 'Вы' : 'Менеджер'}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-neutral-900">{item.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/*
        Комментарий — единственное «письменное» действие клиента в заявке.
        `POST /api/tickets/:id/comments` в контроллере без `@Roles`, то есть доступен
        всем авторизованным; если роли ограничат — кнопку нужно скрывать по правам.
      */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-500">Уточнить детали</span>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Например: доступ в помещение через охрану"
            value={comment}
            maxLength={2000}
            disabled={commentMutation.isPending}
            onChange={(event) => setComment(event.target.value)}
            data-testid="portal-ticket-comment"
          />
        </label>
        {commentMutation.isError && <ErrorBanner error={commentMutation.error} />}
        <Button
          type="submit"
          variant="primary"
          className="min-h-[44px] w-full"
          loading={commentMutation.isPending}
          disabled={comment.trim() === ''}
        >
          Отправить
        </Button>
        {data.comments.length > 0 && (
          <p className="text-center text-xs text-neutral-400">
            {data.comments.length}{' '}
            {plural(data.comments.length, 'комментарий', 'комментария', 'комментариев')} в заявке
          </p>
        )}
      </form>

      {commentMutation.isSuccess && (
        <SoftWarning>Комментарий отправлен — менеджер увидит его в карточке заявки.</SoftWarning>
      )}
      {commentMutation.isError && (
        <p className="text-xs text-danger-600">{errorMessage(commentMutation.error)}</p>
      )}
      <p className="text-xs text-neutral-400">Заявка создана {formatDate(data.createdAt)}</p>
    </div>
  );
}
