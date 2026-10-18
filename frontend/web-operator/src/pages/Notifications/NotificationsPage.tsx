import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner } from '../../components/ui/Feedback';
import { useMarkRead, useNotificationsList } from '../../hooks/useNotifications';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { relativeDay } from '../../lib/date';
import {
  notificationTypeIcon,
  notificationTypeLabel,
  payloadString,
  type NotificationEntity,
} from '../../types/notifications';
import { t } from '../../i18n';

/**
 * Экран «Уведомления» (09.10.2026): список in-app уведомлений оператора.
 * Нажатие отмечает прочитанным и ведёт туда, о чём уведомление: сообщение
 * чата — в чат, заявка — на «Сегодня» (там «Мои заявки»), остальное — просто
 * закрывает карточку.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const query = useNotificationsList(page);
  const markRead = useMarkRead();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const limit = query.data?.limit ?? 30;
  const pages = Math.max(1, Math.ceil(total / limit));

  function open(item: NotificationEntity) {
    if (!item.readAt) markRead.mutate(item.id);
    const chatId = payloadString(item, 'chatId');
    if (chatId) {
      navigate(`/chats/${chatId}`);
      return;
    }
    const ticketId = payloadString(item, 'ticketId');
    if (ticketId) navigate(`/today?ticket=${ticketId}`);
  }

  return (
    <FullscreenLayout title={t('Уведомления')} backTo="/today" showSos={false} testId="notifications_page">
      <div className="flex flex-col gap-3 p-4">
        {query.isLoading && !query.data ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-200" />
            ))}
          </div>
        ) : query.isError && !query.data ? (
          <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title={t('Уведомлений нет')}
            hint={t('Здесь появятся новые заявки, сообщения чатов, SOS и напоминания')}
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="notifications_list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  data-testid={`notification_tile_${item.id}`}
                  className={[
                    'flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm',
                    item.readAt
                      ? 'border-neutral-200 bg-white'
                      : 'border-primary-200 bg-primary-50',
                  ].join(' ')}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {notificationTypeIcon(item.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                      <span>{notificationTypeLabel(item.type)}</span>
                      <span className="shrink-0 font-mono">{relativeDay(item.createdAt)}</span>
                    </span>
                    <span className="block text-sm font-medium text-neutral-900">{item.title}</span>
                    <span className="block text-sm text-neutral-700">{item.body}</span>
                  </span>
                  {!item.readAt && (
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary-500"
                      aria-label={t('Не прочитано')}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 py-2 text-sm text-neutral-600">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('Новее')}
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              {t('Раньше')}
            </Button>
          </div>
        )}
      </div>
    </FullscreenLayout>
  );
}
