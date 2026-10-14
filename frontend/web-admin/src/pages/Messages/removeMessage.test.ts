import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { ChatMessagesPage } from '../../types/chat';
import { CHAT_CHATS_KEY, chatMessagesKey, removeMessageFromCache } from './useChats';
import { attachmentError, isBlockedAttachment } from './MessageAttachments';

function page(ids: string[]): ChatMessagesPage {
  return {
    items: ids.map((id) => ({
      id,
      chatId: 'c-1',
      authorId: 'u-1',
      text: id,
      attachmentIds: [],
      createdAt: '2026-10-14T10:00:00.000Z',
    })),
    limit: 50,
    hasMore: false,
    nextBefore: null,
  };
}

describe('removeMessageFromCache (удаление сообщения админом)', () => {
  it('убирает сообщение из нужной страницы и перезапрашивает список чатов', () => {
    const client = new QueryClient();
    client.setQueryData<InfiniteData<ChatMessagesPage>>(chatMessagesKey('c-1'), {
      pages: [page(['m-3', 'm-4']), page(['m-1', 'm-2'])],
      pageParams: [undefined, 'cursor'],
    });
    client.setQueryData(CHAT_CHATS_KEY, [{ id: 'c-1' }]);
    removeMessageFromCache(client, 'c-1', 'm-2');
    const data = client.getQueryData<InfiniteData<ChatMessagesPage>>(chatMessagesKey('c-1'));
    expect(data?.pages.map((p) => p.items.map((i) => i.id))).toEqual([['m-3', 'm-4'], ['m-1']]);
    expect(client.getQueryState(CHAT_CHATS_KEY)?.isInvalidated).toBe(true);
  });

  it('незнакомый id и отсутствующий кэш не ломают ничего', () => {
    const client = new QueryClient();
    expect(() => removeMessageFromCache(client, 'c-1', 'm-9')).not.toThrow();
    client.setQueryData<InfiniteData<ChatMessagesPage>>(chatMessagesKey('c-1'), {
      pages: [page(['m-1'])],
      pageParams: [undefined],
    });
    const before = client.getQueryData(chatMessagesKey('c-1'));
    removeMessageFromCache(client, 'c-1', 'm-9');
    expect(client.getQueryData(chatMessagesKey('c-1'))).toBe(before);
  });
});

describe('вложения чата: любые файлы, кроме опасных', () => {
  it('офисные документы и архивы проходят, exe/html/svg — нет', () => {
    const ok = new File(['x'], 'смета.xlsx', { type: 'application/vnd.ms-excel' });
    const zip = new File(['x'], 'фото.zip', { type: 'application/zip' });
    const unknown = new File(['x'], 'чертёж.dwg', { type: '' });
    expect(attachmentError(ok)).toBeNull();
    expect(attachmentError(zip)).toBeNull();
    expect(attachmentError(unknown)).toBeNull();
    expect(isBlockedAttachment({ name: 'Setup.EXE' })).toBe(true);
    expect(attachmentError(new File(['x'], 'page.html', { type: 'text/html' }))).toMatch(
      /прикреплять нельзя/,
    );
    expect(attachmentError(new File(['x'], 'logo.svg', { type: 'image/svg+xml' }))).toMatch(
      /прикреплять нельзя/,
    );
    expect(attachmentError(new File([], 'empty.txt', { type: 'text/plain' }))).toMatch(/пустой/);
  });
});
