import { ChatsController } from './chats.controller';
import type { ChatGateway } from './chat.gateway';
import type { ChatsService, DeliveryPlan } from './chats.service';
import type { AuthUser } from '../auth/guards/roles.guard';

const admin: AuthUser = { id: 'u-admin', email: 'a@b.c', role: 'ADMIN', fullName: '' };

function build() {
  const chats = {
    listMyChats: jest.fn(),
    createChat: jest.fn(),
    getChat: jest.fn(),
    listMessages: jest.fn(),
    sendMessage: jest.fn(),
    markRead: jest.fn(),
    search: jest.fn(),
  };
  const gateway = {
    getOnlineUserIds: jest.fn(() => ['u-admin']),
    emitMessageNew: jest.fn(),
    emitMessageRead: jest.fn(),
  };
  const controller = new ChatsController(
    chats as unknown as ChatsService,
    gateway as unknown as ChatGateway,
  );
  return { controller, chats, gateway };
}

const messageView = {
  id: 'm-1',
  chatId: 'c-1',
  authorId: 'u-admin',
  text: 'привет',
  attachmentIds: [],
  createdAt: '2026-01-01T10:00:00.000Z',
  deliveredAt: null,
};

describe('ChatsController', () => {
  it('GET /chats отдаёт чаты текущего пользователя', async () => {
    const { controller, chats } = build();
    chats.listMyChats.mockResolvedValue([{ id: 'c-1' }]);

    await expect(controller.listMyChats(admin)).resolves.toEqual([{ id: 'c-1' }]);
    expect(chats.listMyChats).toHaveBeenCalledWith(admin);
  });

  it('POST /chats делегирует создание чата', async () => {
    const { controller, chats } = build();
    const dto = { type: 'direct' as const, participantIds: ['u-oper'] };
    chats.createChat.mockResolvedValue({ id: 'c-1' });

    await expect(controller.createChat(dto, admin)).resolves.toEqual({ id: 'c-1' });
    expect(chats.createChat).toHaveBeenCalledWith(dto, admin);
  });

  it('GET /chats/:id требует участие (сервис бросает 403)', async () => {
    const { controller, chats } = build();
    chats.getChat.mockRejectedValue(new Error('Вы не участник этого чата'));

    await expect(controller.getChat('c-1', admin)).rejects.toThrow('Вы не участник этого чата');
  });

  it('GET /chats/:id/messages передаёт курсор и лимит', async () => {
    const { controller, chats } = build();
    chats.listMessages.mockResolvedValue({
      items: [],
      limit: 50,
      hasMore: false,
      nextBefore: null,
    });

    await controller.listMessages('c-1', { before: '2026-01-01T09:00:00.000Z', limit: 10 }, admin);

    expect(chats.listMessages).toHaveBeenCalledWith(
      'c-1',
      { before: '2026-01-01T09:00:00.000Z', limit: 10 },
      admin,
    );
  });

  it('POST /chats/:id/messages рассылает message:new и возвращает сохранённое сообщение', async () => {
    const { controller, chats, gateway } = build();
    const plan: DeliveryPlan = {
      message: messageView,
      recipientIds: ['u-oper'],
      offlineIds: ['u-oper'],
      duplicate: false,
    };
    chats.sendMessage.mockResolvedValue(plan);

    const result = await controller.sendMessage('c-1', { text: 'привет' }, admin);

    expect(result).toEqual(messageView);
    // В сервис передаётся актуальный снимок онлайн-пользователей.
    expect(chats.sendMessage.mock.calls[0][3]).toEqual(['u-admin']);
    expect(gateway.emitMessageNew).toHaveBeenCalledWith(plan);
  });

  it('POST /chats/:id/messages: дубль по clientMessageId не рассылает message:new', async () => {
    const { controller, chats, gateway } = build();
    chats.sendMessage.mockResolvedValue({
      message: messageView,
      recipientIds: ['u-oper'],
      offlineIds: [],
      duplicate: true,
    });

    const result = await controller.sendMessage(
      'c-1',
      { text: 'привет', clientMessageId: 'client-1' },
      admin,
    );

    expect(result).toEqual(messageView);
    expect(gateway.emitMessageNew).not.toHaveBeenCalled();
  });

  it('POST /chats/:id/read уведомляет автора через шлюз', async () => {
    const { controller, chats, gateway } = build();
    const result = {
      chatId: 'c-1',
      userId: 'u-oper',
      lastMessageId: 'm-1',
      readAt: '2026-01-01T10:05:00.000Z',
      authorId: 'u-admin',
    };
    chats.markRead.mockResolvedValue(result);

    await expect(controller.markRead('c-1', { lastMessageId: 'm-1' }, admin)).resolves.toEqual(
      result,
    );
    expect(gateway.emitMessageRead).toHaveBeenCalledWith(result);
  });

  it('GET /messages/search ищет только по своим чатам', async () => {
    const { controller, chats } = build();
    chats.search.mockResolvedValue({ items: [], total: 0 });

    await controller.search({ q: 'заявка' }, admin);

    expect(chats.search).toHaveBeenCalledWith({ q: 'заявка' }, admin);
  });
});
