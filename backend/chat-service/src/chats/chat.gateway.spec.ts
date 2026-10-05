import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { authenticateSocket, parseReadPayload, parseSendPayload } from './ws-auth';
import { MAX_MESSAGE_LENGTH } from './dto/chat.dto';
import type { ChatsService, DeliveryPlan, MarkReadResult } from './chats.service';
import type { AuthUser } from '../auth/guards/roles.guard';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin',
  role: 'ADMIN',
  fullName: '',
};
const _operator: AuthUser = {
  id: 'u-oper',
  email: 'operator',
  role: 'OPERATOR',
  fullName: '',
};

function messageView(id = 'msg-1', authorId = 'u-admin') {
  return {
    id,
    chatId: 'c-1',
    authorId,
    text: 'привет',
    attachmentIds: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    deliveredAt: null,
  };
}

function plan(overrides: Partial<DeliveryPlan> = {}): DeliveryPlan {
  return {
    message: messageView(),
    recipientIds: ['u-oper'],
    offlineIds: [],
    duplicate: false,
    ...overrides,
  };
}

function readResult(overrides: Partial<MarkReadResult> = {}): MarkReadResult {
  return {
    chatId: 'c-1',
    userId: 'u-oper',
    lastMessageId: 'msg-1',
    readAt: '2026-01-01T10:05:00.000Z',
    authorId: 'u-admin',
    ...overrides,
  };
}

/** Минимальный сокет: только то, что трогает шлюз. */
function fakeSocket(id: string, auth: unknown) {
  return {
    id,
    data: {} as Record<string, unknown>,
    handshake: { auth, query: {} },
    join: jest.fn(async () => undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

/** Минимальный io.Server с записью рассылок. */
function fakeServer() {
  const emits: Array<{ room: string; event: string; payload: unknown }> = [];
  const broadcasts: Array<{ event: string; payload: unknown }> = [];
  return {
    emits,
    broadcasts,
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ room, event, payload });
      },
    })),
    emit: (event: string, payload: unknown) => {
      broadcasts.push({ event, payload });
    },
  };
}

describe('ChatGateway', () => {
  let chats: {
    sendMessage: jest.Mock;
    markRead: jest.Mock;
  };
  let jwt: { verifyAsync: jest.Mock };
  let gateway: ChatGateway;
  let server: ReturnType<typeof fakeServer>;

  beforeEach(() => {
    chats = { sendMessage: jest.fn(), markRead: jest.fn() };
    jwt = { verifyAsync: jest.fn() };
    gateway = new ChatGateway(jwt as unknown as JwtService, chats as unknown as ChatsService);
    server = fakeServer();
    gateway.server = server as unknown as ChatGateway['server'];
  });

  describe('handleConnection', () => {
    it('принимает соединение с валидным токеном и ведёт онлайн-карту', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-admin', email: 'a@b.c', role: 'ADMIN' });
      const socket = fakeSocket('s-1', { token: 'good' });

      await gateway.handleConnection(socket as never);

      expect(socket.join).toHaveBeenCalledWith('user:u-admin');
      expect(gateway.isOnline('u-admin')).toBe(true);
      expect(gateway.getOnlineSnapshot()).toEqual({ 'u-admin': 1 });
      expect(server.broadcasts).toContainEqual({
        event: 'user:status',
        payload: { userId: 'u-admin', online: true },
      });
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('отклоняет соединение без токена', async () => {
      const socket = fakeSocket('s-2', {});

      await gateway.handleConnection(socket as never);

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(gateway.isOnline('u-admin')).toBe(false);
    });

    it('отклоняет соединение с истёкшим/подделанным токеном', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const socket = fakeSocket('s-3', { token: 'bad' });

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('поддерживает fallback ?token= в query', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-oper', role: 'OPERATOR' });
      const socket = fakeSocket('s-4', {});
      socket.handshake.query = { token: 'from-query' };

      await gateway.handleConnection(socket as never);

      expect(jwt.verifyAsync).toHaveBeenCalledWith('from-query');
      expect(gateway.isOnline('u-oper')).toBe(true);
    });

    it('несколько сокетов одного пользователя дают один онлайн-статус', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-admin', role: 'ADMIN' });
      await gateway.handleConnection(fakeSocket('s-a', { token: 't' }) as never);
      await gateway.handleConnection(fakeSocket('s-b', { token: 't' }) as never);

      expect(gateway.getOnlineSnapshot()).toEqual({ 'u-admin': 2 });
    });

    it('токен без sub отклоняется', async () => {
      jwt.verifyAsync.mockResolvedValue({ email: 'a@b.c' });
      const socket = fakeSocket('s-5', { token: 'opaque' });

      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('убирает сокет и объявляет оффлайн, когда сокетов не осталось', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-admin', role: 'ADMIN' });
      const socket = fakeSocket('s-1', { token: 't' });
      await gateway.handleConnection(socket as never);

      gateway.handleDisconnect(socket as never);

      expect(gateway.isOnline('u-admin')).toBe(false);
      expect(server.broadcasts).toContainEqual({
        event: 'user:status',
        payload: { userId: 'u-admin', online: false },
      });
    });

    it('не объявляет оффлайн, пока открыт второй сокет', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-admin', role: 'ADMIN' });
      const first = fakeSocket('s-1', { token: 't' });
      const second = fakeSocket('s-2', { token: 't' });
      await gateway.handleConnection(first as never);
      await gateway.handleConnection(second as never);

      gateway.handleDisconnect(first as never);

      expect(gateway.isOnline('u-admin')).toBe(true);
      expect(gateway.getOnlineSnapshot()).toEqual({ 'u-admin': 1 });
    });

    it('неизвестный сокет игнорируется', () => {
      gateway.handleDisconnect(fakeSocket('s-unknown', {}) as never);
      expect(gateway.getOnlineSnapshot()).toEqual({});
    });
  });

  describe('message:send', () => {
    let socket: ReturnType<typeof fakeSocket>;

    beforeEach(async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'u-admin',
        email: 'admin',
        role: 'ADMIN',
      });
      socket = fakeSocket('s-1', { token: 't' });
      await gateway.handleConnection(socket as never);
    });

    it('сохраняет сообщение, рассылает message:new получателям и отдаёт ack', async () => {
      chats.sendMessage.mockResolvedValue(plan());

      const ack = await gateway.handleMessageSend(socket as never, {
        chatId: 'c-1',
        text: 'привет',
        attachmentIds: ['f-1'],
      });

      expect(ack).toEqual({ ok: true, message: expect.objectContaining({ id: 'msg-1' }) });
      // Онлайн-получатель в своей комнате, отправитель исключён.
      expect(server.emits).toEqual([
        {
          room: 'user:u-oper',
          event: 'message:new',
          payload: expect.objectContaining({ id: 'msg-1' }),
        },
      ]);
      // В расчёт оффлайна уходит снимок онлайн-карты.
      expect(chats.sendMessage.mock.calls[0][2]).toEqual(admin);
      expect(chats.sendMessage.mock.calls[0][3]).toEqual(['u-admin']);
    });

    it('переносит clientMessageId из payload в сервис', async () => {
      chats.sendMessage.mockResolvedValue(plan());

      await gateway.handleMessageSend(socket as never, {
        chatId: 'c-1',
        text: 'привет',
        clientMessageId: 'client-1',
      });

      expect(chats.sendMessage.mock.calls[0][1]).toMatchObject({
        text: 'привет',
        clientMessageId: 'client-1',
      });
    });

    it('дубль по clientMessageId: ack отдаётся, повторной рассылки нет', async () => {
      chats.sendMessage.mockResolvedValue(plan({ duplicate: true }));

      const ack = await gateway.handleMessageSend(socket as never, {
        chatId: 'c-1',
        text: 'привет',
        clientMessageId: 'client-1',
      });

      expect(ack).toEqual({ ok: true, message: expect.objectContaining({ id: 'msg-1' }) });
      expect(server.emits).toEqual([]);
    });

    it('отдаёт ack с ошибкой при невалидном payload', async () => {
      const ack = await gateway.handleMessageSend(socket as never, { chatId: '', text: '' });
      expect(ack).toEqual({ ok: false, error: 'Укажите chatId' });
      expect(chats.sendMessage).not.toHaveBeenCalled();
    });

    it('переносит 403 сервиса в ack со статусом', async () => {
      chats.sendMessage.mockRejectedValue(new ForbiddenException('Вы не участник этого чата'));

      const ack = await gateway.handleMessageSend(socket as never, {
        chatId: 'c-foreign',
        text: 'привет',
      });

      expect(ack).toMatchObject({ ok: false, error: 'Вы не участник этого чата', status: 403 });
    });

    it('отклоняет событие от неавторизованного соединения', async () => {
      const anonymous = fakeSocket('s-anon', {});
      const ack = await gateway.handleMessageSend(anonymous as never, {
        chatId: 'c-1',
        text: 'привет',
      });
      expect(ack).toEqual({ ok: false, error: 'Соединение не авторизовано' });
    });

    it('404 сервиса тоже становится ack-ошибкой', async () => {
      chats.sendMessage.mockRejectedValue(new NotFoundException('Чат не найден'));
      const ack = await gateway.handleMessageSend(socket as never, {
        chatId: 'ghost',
        text: 'привет',
      });
      expect(ack).toMatchObject({ ok: false, error: 'Чат не найден', status: 404 });
    });
  });

  describe('message:read', () => {
    let socket: ReturnType<typeof fakeSocket>;

    beforeEach(async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-oper', role: 'OPERATOR' });
      socket = fakeSocket('s-1', { token: 't' });
      await gateway.handleConnection(socket as never);
    });

    it('уведомляет автора событием message:read', async () => {
      chats.markRead.mockResolvedValue(readResult());

      const ack = await gateway.handleMessageRead(socket as never, {
        chatId: 'c-1',
        lastMessageId: 'msg-1',
      });

      expect(ack).toEqual({ ok: true, readAt: '2026-01-01T10:05:00.000Z' });
      expect(server.emits).toEqual([
        {
          room: 'user:u-admin',
          event: 'message:read',
          payload: {
            chatId: 'c-1',
            messageId: 'msg-1',
            readBy: 'u-oper',
            readAt: '2026-01-01T10:05:00.000Z',
          },
        },
      ]);
    });

    it('не отправляет событие, если прочитано своё сообщение', async () => {
      chats.markRead.mockResolvedValue(readResult({ authorId: null, userId: 'u-admin' }));

      await gateway.handleMessageRead(socket as never, { chatId: 'c-1', lastMessageId: 'msg-1' });
      expect(server.emits).toEqual([]);
    });

    it('валидирует payload отметки прочтения', async () => {
      const ack = await gateway.handleMessageRead(socket as never, { chatId: 'c-1' });
      expect(ack).toEqual({ ok: false, error: 'Укажите chatId и lastMessageId' });
    });

    it('ошибка сервиса попадает в ack', async () => {
      chats.markRead.mockRejectedValue(new ForbiddenException('Вы не участник этого чата'));
      const ack = await gateway.handleMessageRead(socket as never, {
        chatId: 'c-1',
        lastMessageId: 'msg-1',
      });
      expect(ack).toMatchObject({ ok: false, status: 403 });
    });
  });

  describe('рассылка REST-фолбэка', () => {
    it('emitMessageNew без exclude рассылает всем получателям', () => {
      gateway.emitMessageNew(plan({ recipientIds: ['u-oper', 'u-client'] }));
      expect(server.emits.map((item) => item.room)).toEqual(['user:u-oper', 'user:u-client']);
    });

    it('emitMessageNew с excludeUserId пропускает отправителя', () => {
      gateway.emitMessageNew(plan({ recipientIds: ['u-oper', 'u-admin'] }), {
        excludeUserId: 'u-admin',
      });
      expect(server.emits.map((item) => item.room)).toEqual(['user:u-oper']);
    });

    it('afterInit не падает', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });
});

describe('authenticateSocket', () => {
  it('возвращает пользователя для валидного токена', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u-1', role: 'ADMIN' }) };
    const result = await authenticateSocket(jwt as unknown as JwtService, {
      auth: { token: 't' },
    });
    expect(result?.user).toMatchObject({ id: 'u-1', role: 'ADMIN' });
  });

  it('возвращает null без токена и при ошибке проверки', async () => {
    const jwt = { verifyAsync: jest.fn() };
    await expect(
      authenticateSocket(jwt as unknown as JwtService, { auth: undefined }),
    ).resolves.toBeNull();

    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      authenticateSocket(jwt as unknown as JwtService, { auth: { token: 't' } }),
    ).resolves.toBeNull();
  });
});

describe('parseSendPayload / parseReadPayload', () => {
  it('принимает корректный payload и обрезает пробелы', () => {
    const result = parseSendPayload({ chatId: 'c-1', text: '  привет  ', attachmentIds: ['f-1'] });
    expect(result).toEqual({
      ok: true,
      value: { chatId: 'c-1', text: 'привет', attachmentIds: ['f-1'] },
    });
  });

  it('отклоняет пустой текст, длинный текст и неверные вложения', () => {
    expect(parseSendPayload({ chatId: 'c-1', text: '   ' })).toEqual({
      ok: false,
      error: 'Сообщение не может быть пустым',
    });
    expect(parseSendPayload({ chatId: 'c-1', text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) })).toEqual({
      ok: false,
      error: `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов`,
    });
    expect(parseSendPayload({ chatId: 'c-1', text: 'a', attachmentIds: [1] })).toEqual({
      ok: false,
      error: 'attachmentIds должен быть массивом строк',
    });
    expect(
      parseSendPayload({
        chatId: 'c-1',
        text: 'a',
        attachmentIds: Array.from({ length: 21 }, (_, index) => `f-${index}`),
      }),
    ).toEqual({ ok: false, error: 'Слишком много вложений (максимум 20)' });
  });

  it('пустой массив вложений допустим', () => {
    expect(parseSendPayload({ chatId: 'c-1', text: 'a', attachmentIds: [] })).toEqual({
      ok: true,
      value: { chatId: 'c-1', text: 'a', attachmentIds: [] },
    });
  });

  it('принимает clientMessageId и включает его в value', () => {
    expect(parseSendPayload({ chatId: 'c-1', text: 'a', clientMessageId: ' client-1 ' })).toEqual({
      ok: true,
      value: { chatId: 'c-1', text: 'a', attachmentIds: [], clientMessageId: 'client-1' },
    });
  });

  it('отклоняет пустой, нестрочный и слишком длинный clientMessageId', () => {
    expect(parseSendPayload({ chatId: 'c-1', text: 'a', clientMessageId: '  ' })).toEqual({
      ok: false,
      error: 'clientMessageId должен быть непустой строкой',
    });
    expect(parseSendPayload({ chatId: 'c-1', text: 'a', clientMessageId: 42 })).toEqual({
      ok: false,
      error: 'clientMessageId должен быть непустой строкой',
    });
    expect(
      parseSendPayload({ chatId: 'c-1', text: 'a', clientMessageId: 'x'.repeat(101) }),
    ).toEqual({ ok: false, error: 'clientMessageId длиннее 100 символов' });
  });

  it('валидирует payload отметки прочтения', () => {
    expect(parseReadPayload({ chatId: 'c-1', lastMessageId: 'm-1' })).toEqual({
      ok: true,
      value: { chatId: 'c-1', lastMessageId: 'm-1' },
    });
    expect(parseReadPayload({ chatId: 'c-1' })).toEqual({
      ok: false,
      error: 'Укажите chatId и lastMessageId',
    });
  });
});
