import { useEffect, useRef, useState, type ReactNode } from 'react';
import { uploadFile } from '../../api/files';
import { Button, ErrorBanner, LoadingBlock, Textarea } from '../../components/ui';
import { ConfirmDialog } from '../../components/ui/Modal';
import type { ChatConnectionStatus } from '../../hooks/useChatSocket';
import { useIsAdmin } from '../../hooks/usePermissions';
import { MAX_CHAT_MESSAGE_LENGTH } from '../../types/chat';
import { formatBytes } from '../Objects/utils';
import { formatDateTime } from '../Tickets/ticketHelpers';
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_MAX_COUNT,
  MessageAttachments,
  attachmentError,
  attachmentIcon,
} from './MessageAttachments';
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
  // Вложения (12.10.2026): файлы копятся до отправки, уходят в file-service
  // (kind=chat) по одному, затем сообщение с их id.
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ index: number; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  // Удаление сообщений (14.10.2026): только ADMIN, с подтверждением.
  const isAdmin = useIsAdmin();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      const error = attachmentError(file);
      if (error) {
        setFileError(error);
        return;
      }
      next.push(file);
    }
    setFileError(null);
    setFiles((current) => [...current, ...next].slice(0, CHAT_ATTACHMENT_MAX_COUNT));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit() {
    const value = text.trim();
    if ((value === '' && files.length === 0) || room.sending || uploading) return;
    const attachmentIds: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        setUploading({ index, percent: 0 });
        const uploaded = await uploadFile(files[index], {
          kind: 'chat',
          onProgress: (percent) => setUploading({ index, percent }),
        });
        attachmentIds.push(uploaded.id);
      }
    } catch (error) {
      setFileError(
        `Не удалось загрузить «${files[attachmentIds.length]?.name ?? 'файл'}»: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setUploading(null);
      return;
    }
    setUploading(null);
    try {
      await room.send(value, attachmentIds);
      setText('');
      setFiles([]);
      setFileError(null);
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
                {room.loadingOlder
                  ? 'Загрузка истории…'
                  : 'Прокрутите вверх, чтобы загрузить историю'}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {messages.map((message) => {
                const mine = room.currentUserId !== null && message.authorId === room.currentUserId;
                const author =
                  chatUserName(room.users, message.authorId) ?? message.authorId.slice(0, 8);
                return (
                  <li
                    key={message.id}
                    data-testid={`messages-message-${message.id}`}
                    className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}
                  >
                    <span className="flex items-center gap-2 text-xs text-neutral-500">
                      {mine ? 'Вы' : author} · {formatDateTime(message.createdAt)}
                      {isAdmin && (
                        <button
                          type="button"
                          aria-label="Удалить сообщение"
                          title="Удалить сообщение"
                          data-testid={`messages-delete-${message.id}`}
                          disabled={room.removingId !== null}
                          onClick={() => setPendingDelete(message.id)}
                          className="rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-danger-600 disabled:opacity-50"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                    <span
                      className={[
                        'mt-1 max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                        mine ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-900',
                      ].join(' ')}
                    >
                      {message.text}
                    </span>
                    <MessageAttachments ids={message.attachmentIds} mine={mine} />
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
        {room.removeError ? <ErrorBanner error={room.removeError} /> : null}
        {fileError ? <ErrorBanner error={new Error(fileError)} /> : null}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" data-testid="messages-pending-attachments">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
              >
                {attachmentIcon(file)}
                <span className="max-w-[160px] truncate">{file.name}</span>
                <span className="text-neutral-400">{formatBytes(file.size)}</span>
                {uploading && uploading.index === index ? (
                  <span className="text-primary-600">{uploading.percent} %</span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Убрать ${file.name}`}
                    className="text-neutral-400 hover:text-danger-600"
                    disabled={Boolean(uploading)}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={CHAT_ATTACHMENT_ACCEPT}
            multiple
            className="sr-only"
            data-testid="messages-attach-input"
            onChange={(event) => addFiles(event.target.files)}
          />
          <Button
            variant="secondary"
            type="button"
            aria-label="Прикрепить фото, видео или файл"
            title="Прикрепить фото, видео или PDF (до 50 МБ)"
            data-testid="messages-attach"
            disabled={Boolean(uploading) || room.sending}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </Button>
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
            loading={room.sending || Boolean(uploading)}
            disabled={text.trim() === '' && files.length === 0}
            onClick={() => void submit()}
          >
            {uploading ? `Загрузка ${uploading.index + 1}/${files.length}…` : 'Отправить'}
          </Button>
        </div>
        <span className="text-xs text-neutral-400">
          {status === 'online'
            ? 'Сообщение уходит мгновенно по WebSocket.'
            : 'WebSocket недоступен: сообщение уйдёт обычным запросом (REST-фолбэк).'}
        </span>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить сообщение?"
        message="Сообщение исчезнет у всех участников чата. Отменить удаление нельзя."
        confirmLabel="Удалить"
        busy={room.removingId !== null}
        onConfirm={() => {
          const id = pendingDelete;
          if (!id) return;
          void room
            .remove(id)
            .catch(() => undefined)
            .finally(() => setPendingDelete(null));
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
