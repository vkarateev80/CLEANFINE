import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ErrorBanner, LoadingBlock, Textarea } from '../../components/ui';
import type { ChatConnectionStatus } from '../../hooks/useChatSocket';
import { MAX_CHAT_MESSAGE_LENGTH } from '../../types/chat';
import { formatDateTime } from '../Tickets/ticketHelpers';
import { chatUserName, type ChatRoomData } from './useChats';

/**
 * Переписка чата (М5.3) — общая для инбокса «Сообщения» и встроенных чатов
 * заявки/объекта: один код отрисовки означает одинаковые `data-testid`
 * (`messages-thread`, `messages-input`, `messages-send`) и одинаковое поведение
 * прокрутки в обоих местах.
 *
 * Данные приходят снаружи (`room`): история, отправка и отметка прочтения живут
 * в `useChatRoom`, а сокет — на уровне страницы, чтобы его слушатели обновляли
 * и список чатов, и открытую переписку одним потоком.
 */

export interface ChatThreadProps {
  title: string;
  subtitle?: ReactNode;
  status: ChatConnectionStatus;
  room: ChatRoomData;
  /** Момент (ISO), до которого собеседник прочитал: подпись «прочитано» у своих. */
  readUntil?: string | null;
  /** Мобильная раскладка: возврат к списку чатов. */
  onBack?: () => void;
  emptyHint?: string;
  placeholder?: string;
}

export function ChatThread({
  title,
  subtitle,
  status,
  room,
  readUntil,
  onBack,
  emptyHint = 'Сообщений пока нет — напишите первым.',
  placeholder = 'Сообщение…',
}: ChatThreadProps) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const messages = room.messages;
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  /**
   * Прокрутка вниз на новом сообщении и при открытии чата. Сравниваем именно
   * последний id: подгрузка истории вверх добавляет сообщения в НАЧАЛО списка,
   * и «прыжок» вниз на ней был бы ошибкой (позицию сохраняет `loadOlder`).
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (lastMessageId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessageId;
      node.scrollTop = node.scrollHeight;
    }
  }, [lastMessageId, room.chatId]);

  // Смена чата — новая переписка: сбрасываем «какое сообщение считаем последним».
  useEffect(() => {
    lastMessageIdRef.current = null;
  }, [room.chatId]);

  /**
   * Подгрузка истории вверх. Перед запросом запоминаем высоту и прокрутку, после
   * вставки восстанавливаем их — иначе браузер оставил бы пользователя на самом
   * верху новой страницы (резкий скачок содержимого).
   */
  async function loadOlder() {
    const node = scrollRef.current;
    if (!node || room.loadingOlder || !room.hasMore) return;
    const previousHeight = node.scrollHeight;
    const previousTop = node.scrollTop;
    await room.loadOlder();
    requestAnimationFrame(() => {
      const current = scrollRef.current;
      if (!current) return;
      current.scrollTop = current.scrollHeight - previousHeight + previousTop;
    });
  }

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    if (node.scrollTop <= 40) void loadOlder();
  }

  async function submit() {
    const value = text.trim();
    if (value === '' || room.sending) return;
    try {
      await room.send(value);
      setText('');
    } catch {
      // Текст остаётся в поле, а причина видна в баннере над ним — так пользователь
      // не набирает сообщение заново после обрыва соединения.
    }
  }

  const statusText =
    status === 'online'
      ? 'На связи'
      : status === 'connecting'
        ? 'Подключение…'
        : 'Нет соединения — отправка через REST';

  const statusClass =
    status === 'online'
      ? 'bg-success-500'
      : status === 'connecting'
        ? 'bg-warning-500'
        : 'bg-danger-500';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>
              ← Чаты
            </Button>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-900">{title}</div>
            {subtitle && <div className="truncate text-xs text-neutral-500">{subtitle}</div>}
          </div>
        </div>
        <span
          data-testid="messages-connection-status"
          className="flex shrink-0 items-center gap-2 text-xs text-neutral-500"
        >
          <span className={`inline-block h-2 w-2 rounded-full ${statusClass}`} aria-hidden="true" />
          {statusText}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="messages-thread"
        className="flex max-h-[55vh] min-h-[240px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {room.isLoading ? (
          <LoadingBlock label="Загрузка переписки…" />
        ) : room.error ? (
          <ErrorBanner error={room.error} onRetry={room.refetch} />
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-400">{emptyHint}</p>
        ) : (
          <>
            {room.hasMore && (
              <p className="text-center text-xs text-neutral-400">
                {room.loadingOlder ? 'Загрузка истории…' : 'Прокрутите вверх, чтобы загрузить историю'}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {messages.map((message) => {
                const mine = room.currentUserId !== null && message.authorId === room.currentUserId;
                const author = chatUserName(room.users, message.authorId) ?? message.authorId.slice(0, 8);
                return (
                  <li
                    key={message.id}
                    data-testid={`messages-message-${message.id}`}
                    className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}
                  >
                    <span className="text-xs text-neutral-500">
                      {mine ? 'Вы' : author} · {formatDateTime(message.createdAt)}
                    </span>
                    <span
                      className={[
                        'mt-1 max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                        mine ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-900',
                      ].join(' ')}
                    >
                      {message.text}
                    </span>
                    {mine && readUntil && readUntil >= message.createdAt && (
                      <span className="mt-0.5 text-xs text-neutral-400">прочитано</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-3">
        {room.sendError ? <ErrorBanner error={room.sendError} /> : null}
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="messages-input"
            aria-label={`Сообщение в чат «${title}»`}
            className="min-h-[44px]"
            placeholder={placeholder}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter отправляет, Shift+Enter — перенос строки (привычка мессенджеров).
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button
            data-testid="messages-send"
            loading={room.sending}
            disabled={text.trim() === ''}
            onClick={() => void submit()}
          >
            Отправить
          </Button>
        </div>
        <span className="text-xs text-neutral-400">
          {status === 'online'
            ? 'Сообщение уходит мгновенно по WebSocket.'
            : 'WebSocket недоступен: сообщение уйдёт обычным запросом (REST-фолбэк).'}
        </span>
      </div>
    </div>
  );
}
