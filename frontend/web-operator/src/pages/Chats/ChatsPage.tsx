import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CountDot } from '../../components/ui/Badge';
import { EmptyState, ErrorBanner } from '../../components/ui/Feedback';
import { useHeaderTitle } from '../../hooks/useHeaderTitle';
import { relativeDay } from '../../lib/date';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/uiStore';
import { CHAT_TYPE_ICON, chatTitle, useMyChats } from './useChats';
import { t } from '../../i18n';

/** Список чатов (chat.md §2.1): объект, заявка, личные, системные; `?ticket=` ведёт в чат заявки. */
export function ChatsPage() {
  useHeaderTitle(t('Чаты'));
  const chats = useMyChats();
  const me = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ticketId = params.get('ticket');

  useEffect(() => {
    if (!ticketId || !chats.data) return;
    const chat = chats.data.find((item) => item.ticketId === ticketId);
    if (chat) navigate(`/chats/${chat.id}`, { replace: true });
    else showToast(t('Чата по этой заявке пока нет'), 'info');
  }, [ticketId, chats.data, navigate]);

  if (chats.isLoading && !chats.data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
    );
  }
  if (chats.isError && !chats.data) {
    return (
      <ErrorBanner
        error={new Error(t('Не удалось загрузить чаты'))}
        onRetry={() => void chats.refetch()}
      />
    );
  }
  const items = chats.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('Чатов пока нет')}
        hint={t('Чат появится, когда бригадир создаст его по объекту или заявке')}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="chats_list">
      {items.map((chat) => {
        const preview = chat.lastMessage
          ? `${chat.lastMessage.authorId === me ? t('Вы: ') : ''}${chat.lastMessage.text || (chat.lastMessage.attachmentIds.length ? t('📎 Вложение') : '')}`
          : t('Сообщений пока нет');
        return (
          <li key={chat.id}>
            <Link
              to={`/chats/${chat.id}`}
              className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:border-primary-500"
              data-testid={`chat_tile_${chat.id}`}
            >
              <span className="text-2xl" aria-hidden="true">
                {CHAT_TYPE_ICON[chat.type] ?? '💬'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">
                    {chatTitle(chat)}
                  </span>
                  {chat.lastMessage && (
                    <span className="shrink-0 font-mono text-xs text-neutral-500">
                      {relativeDay(chat.lastMessage.createdAt)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-neutral-500">{preview}</span>
                  <CountDot value={chat.unreadCount} label={t('Непрочитанных: {unreadCount}', { unreadCount: chat.unreadCount })} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
