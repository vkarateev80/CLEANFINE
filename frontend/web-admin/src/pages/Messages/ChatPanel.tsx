import { useState } from 'react';
import { Card, ErrorBanner, LoadingBlock, SoftWarning } from '../../components/ui';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { appendMessageToCache, useChatByReference, useChatRoom } from './useChats';
import { ChatThread } from './ChatThread';

/**
 * Встроенный чат карточки (М5.3): «чат заявки» по `ticketId` и «чат объекта» по
 * `objectId`.
 *
 * Чат создаётся идемпотентно: `POST /api/chat/chats` для `ticket`/`object`
 * возвращает уже существующий чат, поэтому блок можно монтировать на каждое
 * открытие карточки. Роли вне ADMIN/SUPERVISOR чат создать не могут — им
 * показывается существующий (если они участники) или подсказка, что чат ещё не
 * создан: 403 на каждой загрузке карточки был бы шумом, а не ответом.
 */

export interface ChatPanelProps {
  kind: 'ticket' | 'object';
  /** id заявки или объекта; пока карточка грузится — undefined. */
  refId: string | undefined;
  title: string;
  /** `data-testid` блока: `ticket-chat` в карточке заявки, `object-chat` — на объекте. */
  testId: 'ticket-chat' | 'object-chat';
  emptyHint?: string;
}

export function ChatPanel({ kind, refId, title, testId, emptyHint }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const canCreate = useCanAssignTicket();
  const chatQuery = useChatByReference(kind, refId);
  const chat = chatQuery.data ?? null;
  const [readUntil, setReadUntil] = useState<string | null>(null);

  // Слушатели сокета обновляют кэш именно этого чата; `chat` в замыкании всегда
  // актуален — хук хранит обработчики в ref и не пересобирает соединение.
  const socket = useChatSocket({
    onMessageNew: (message) => {
      if (chat !== null && message.chatId === chat.id) appendMessageToCache(queryClient, message);
    },
    onMessageRead: (event) => {
      if (chat !== null && event.chatId === chat.id) setReadUntil(event.readAt);
    },
  });

  const room = useChatRoom(chat?.id ?? null, socket);

  return (
    <Card testId={testId} padded={false} className="overflow-hidden">
      {chatQuery.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-medium text-neutral-900">{title}</h2>
          <LoadingBlock label="Загрузка чата…" />
        </div>
      ) : chatQuery.isError ? (
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-medium text-neutral-900">{title}</h2>
          <ErrorBanner error={chatQuery.error} onRetry={() => void chatQuery.refetch()} />
        </div>
      ) : chat === null ? (
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-medium text-neutral-900">{title}</h2>
          <SoftWarning>
            {canCreate
              ? 'Чат ещё не создан — обновите блок, чтобы создать его.'
              : 'Чат ещё не создан. Его открывает ADMIN, SUPERVISOR или MANAGER, после чего переписка появится у участников.'}
          </SoftWarning>
        </div>
      ) : (
        <ChatThread
          title={title}
          subtitle={kind === 'ticket' ? 'обсуждение заявки' : 'обсуждение объекта'}
          status={socket.status}
          room={room}
          readUntil={readUntil}
          emptyHint={emptyHint}
        />
      )}
    </Card>
  );
}
