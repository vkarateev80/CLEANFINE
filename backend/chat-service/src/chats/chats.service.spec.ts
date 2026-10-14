import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatsService, isUniqueViolation } from './chats.service';
import { CoreClient } from '../integration/core.client';
import { TicketClient } from '../integration/ticket.client';
import type { ChatPushRequest, ChatPushNotifier } from '../integration/notification-push.client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/guards/roles.guard';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin',
  role: 'ADMIN',
  fullName: '',
};
const supervisor: AuthUser = {
  id: 'u-super',
  email: 'supervisor@cleaning-ops.com',
  role: 'SUPERVISOR',
  fullName: '',
};
const operator: AuthUser = {
  id: 'u-oper',
  email: 'operator',
  role: 'OPERATOR',
  fullName: '',
};
const clientRole: AuthUser = {
  id: 'u-client',
  email: 'client',
  role: 'CLIENT',
  fullName: '',
};

const NOW = new Date('2026-01-01T10:00:00.000Z');

function chatRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    type: 'direct',
    title: null,
    objectId: null,
    ticketId: null,
    createdAt: NOW,
    ...overrides,
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    chatId: 'c-1',
    userId: 'u-admin',
    role: 'creator',
    lastReadAt: null,
    joinedAt: NOW,
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    chatId: 'c-1',
    authorId: 'u-oper',
    text: 'привет',
    attachmentIds: [],
    createdAt: NOW,
    ...overrides,
  };
}

/** Мок Prisma: возвращает только то, что реально вызывает ChatsService. */
function createPrismaMock() {
  return {
    chat: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    chatMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function createPushMock(): ChatPushNotifier & { calls: ChatPushRequest[] } {
  const calls: ChatPushRequest[] = [];
  return {
    calls,
    notifyOffline: jest.fn(async (request: ChatPushRequest) => {
      calls.push(request);
      return request.userIds.length;
    }),
  };
}

describe('ChatsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let tickets: { getParticipants: jest.Mock; clearCache: jest.Mock };
  let core: { objectExists: jest.Mock };
  let push: ChatPushNotifier & { calls: ChatPushRequest[] };
  let service: ChatsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tickets = { getParticipants: jest.fn(), clearCache: jest.fn() };
    core = { objectExists: jest.fn() };
    push = createPushMock();
    const config = {
      get: jest.fn((key: string) => (key === 'chat.lastMessagePreviewLength' ? 10 : undefined)),
    } as unknown as ConfigService;
    service = new ChatsService(
      prisma as unknown as PrismaService,
      config,
      tickets as unknown as TicketClient,
      core as unknown as CoreClient,
      push,
    );
  });

  // ------------------------------------------------------------- список чатов

  describe('listMyChats', () => {
    it('возвращает пустой список, если пользователь не состоит в чатах', async () => {
      prisma.chatMember.findMany.mockResolvedValue([]);
      await expect(service.listMyChats(operator)).resolves.toEqual([]);
      // Лишних запросов нет: без участия нечего обогащать.
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('сортирует чаты по последнему сообщению и считает непрочитанные', async () => {
      prisma.chatMember.findMany.mockResolvedValue([
        { chatId: 'c-1', lastReadAt: null, chat: chatRow({ id: 'c-1' }) },
        {
          chatId: 'c-2',
          lastReadAt: new Date('2026-01-01T09:00:00.000Z'),
          chat: chatRow({ id: 'c-2', type: 'ticket' }),
        },
      ]);
      prisma.message.findMany
        // Первый вызов — последние сообщения по всем чатам.
        .mockResolvedValueOnce([
          messageRow({
            id: 'm-c1',
            chatId: 'c-1',
            createdAt: new Date('2026-01-01T09:30:00.000Z'),
          }),
          messageRow({
            id: 'm-c2',
            chatId: 'c-2',
            createdAt: new Date('2026-01-01T09:45:00.000Z'),
          }),
        ])
        // Второй — непрочитанные (по OR-условиям).
        .mockResolvedValueOnce([{ chatId: 'c-1' }, { chatId: 'c-1' }]);

      const result = await service.listMyChats(operator);

      expect(result.map((chat) => chat.id)).toEqual(['c-2', 'c-1']);
      expect(result[1].unreadCount).toBe(2);
      expect(result[0].unreadCount).toBe(0);
      expect(result[1].lastMessage?.id).toBe('m-c1');
    });

    it('обрезает превью последнего сообщения до настроенной длины', async () => {
      prisma.chatMember.findMany.mockResolvedValue([
        { chatId: 'c-1', lastReadAt: NOW, chat: chatRow() },
      ]);
      prisma.message.findMany
        .mockResolvedValueOnce([messageRow({ text: 'очень длинное сообщение для превью' })])
        .mockResolvedValueOnce([]);

      const [summary] = await service.listMyChats(operator);
      expect(summary.lastMessage?.text).toBe('очень длин…');
    });

    it('чат без сообщений получает lastMessage=null', async () => {
      prisma.chatMember.findMany.mockResolvedValue([
        { chatId: 'c-1', lastReadAt: null, chat: chatRow() },
      ]);
      prisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const [summary] = await service.listMyChats(operator);
      expect(summary.lastMessage).toBeNull();
      expect(summary.unreadCount).toBe(0);
      expect(summary.createdAt).toBe(NOW.toISOString());
    });
  });

  // ---------------------------------------------------------- создание чатов

  describe('createChat (direct)', () => {
    it('создаёт личный чат: себя + второго участника', async () => {
      prisma.chat.findFirst.mockResolvedValue(null);
      prisma.chat.create.mockResolvedValue(
        chatRow({
          members: [
            memberRow({ userId: 'u-admin' }),
            memberRow({
              id: 'm-2',
              userId: 'u-oper',
              joinedAt: new Date('2026-01-01T10:00:01.000Z'),
            }),
          ],
        }),
      );

      const chat = await service.createChat({ type: 'direct', participantIds: ['u-oper'] }, admin);

      expect(chat.members.map((member) => member.userId)).toEqual(['u-admin', 'u-oper']);
      const createArg = prisma.chat.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('direct');
      expect(createArg.data.members.create).toEqual([
        { userId: 'u-admin', role: 'creator' },
        { userId: 'u-oper', role: 'member' },
      ]);
    });

    it('возвращает существующий диалог вместо создания второго', async () => {
      prisma.chat.findFirst.mockResolvedValue({
        ...chatRow(),
        members: [memberRow({ userId: 'u-admin' }), memberRow({ id: 'm-2', userId: 'u-oper' })],
      });

      const chat = await service.createChat({ type: 'direct', participantIds: ['u-oper'] }, admin);

      expect(chat.id).toBe('c-1');
      expect(prisma.chat.create).not.toHaveBeenCalled();
    });

    it('не считает диалог существующим, если участников больше двух', async () => {
      prisma.chat.findFirst.mockResolvedValue({
        ...chatRow(),
        members: [
          memberRow(),
          memberRow({ id: 'm-2', userId: 'u-oper' }),
          memberRow({ id: 'm-3', userId: 'u-x' }),
        ],
      });
      prisma.chat.create.mockResolvedValue({
        ...chatRow(),
        members: [memberRow(), memberRow({ id: 'm-2', userId: 'u-oper' })],
      });

      await service.createChat({ type: 'direct', participantIds: ['u-oper'] }, admin);
      expect(prisma.chat.create).toHaveBeenCalled();
    });

    it('без второго участника → 400', async () => {
      await expect(service.createChat({ type: 'direct' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.createChat({ type: 'direct', participantIds: ['u-oper', 'u-client'] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('игнорирует себя в participantIds (иначе «чат с самим собой»)', async () => {
      prisma.chat.findFirst.mockResolvedValue(null);
      prisma.chat.create.mockResolvedValue({
        ...chatRow(),
        members: [memberRow(), memberRow({ id: 'm-2', userId: 'u-oper' })],
      });

      await service.createChat({ type: 'direct', participantIds: ['u-admin', 'u-oper'] }, admin);
      const createArg = prisma.chat.create.mock.calls[0][0];
      expect(createArg.data.members.create).toHaveLength(2);
    });
  });

  describe('createChat (ticket)', () => {
    it('требует ticketId', async () => {
      await expect(service.createChat({ type: 'ticket' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('запрещает создание OPERATOR (только ADMIN/SUPERVISOR)', async () => {
      await expect(
        service.createChat({ type: 'ticket', ticketId: 't-1' }, operator),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('повторное создание возвращает существующий чат по ticketId (идемпотентность)', async () => {
      prisma.chat.findUnique.mockResolvedValueOnce(
        chatRow({ id: 'c-9', type: 'ticket', ticketId: 't-1' }),
      );
      tickets.getParticipants.mockResolvedValue({
        id: 't-1',
        objectId: 'o-1',
        assigneeId: 'u-oper',
        assigneeIds: ['u-oper'],
        createdBy: 'u-client',
      });
      prisma.chatMember.upsert.mockResolvedValue({});
      prisma.chat.findUniqueOrThrow.mockResolvedValue({
        ...chatRow({ id: 'c-9', type: 'ticket', ticketId: 't-1' }),
        members: [memberRow({ chatId: 'c-9' })],
      });

      const chat = await service.createChat({ type: 'ticket', ticketId: 't-1' }, admin);

      expect(chat.id).toBe('c-9');
      expect(prisma.chat.create).not.toHaveBeenCalled();
      // Создатель закрепляется участником, участники заявки доcинхронизируются.
      expect(prisma.chatMember.upsert).toHaveBeenCalled();
    });

    it('создаёт чат с участниками заявки (исполнитель + автор) и БЕЗ objectId', async () => {
      prisma.chat.findUnique.mockResolvedValueOnce(null);
      tickets.getParticipants.mockResolvedValue({
        id: 't-1',
        objectId: 'o-1',
        assigneeId: 'u-oper',
        assigneeIds: ['u-oper'],
        createdBy: 'u-client',
      });
      prisma.chat.create.mockResolvedValue({
        ...chatRow({ id: 'c-10', type: 'ticket', ticketId: 't-1' }),
        members: [memberRow({ chatId: 'c-10' })],
      });

      const chat = await service.createChat({ type: 'ticket', ticketId: 't-1' }, admin);

      expect(chat.id).toBe('c-10');
      const createArg = prisma.chat.create.mock.calls[0][0];
      const createdIds = createArg.data.members.create.map((m: { userId: string }) => m.userId);
      expect(createdIds).toEqual(expect.arrayContaining(['u-admin', 'u-oper', 'u-client']));
      expect(createArg.data.ticketId).toBe('t-1');
      // Регрессия дефекта М7.3: objectId — глобально уникальное поле object-чатов,
      // и запись сюда объекта заявки делала вторую заявку того же объекта
      // невыполнимой (P2002 на Chat_objectId_key → 500 «No Chat found»).
      expect(createArg.data.objectId).toBeUndefined();
    });

    it('создаёт чат даже при недоступном ticket-service', async () => {
      prisma.chat.findUnique.mockResolvedValueOnce(null);
      tickets.getParticipants.mockResolvedValue(null);
      prisma.chat.create.mockResolvedValue({
        ...chatRow({ id: 'c-11', type: 'ticket', ticketId: 't-2' }),
        members: [memberRow({ chatId: 'c-11' })],
      });

      const chat = await service.createChat(
        { type: 'ticket', ticketId: 't-2', participantIds: ['u-oper'] },
        supervisor,
      );
      expect(chat.id).toBe('c-11');
    });

    it('гонка create (P2002) возвращает уже созданный чат', async () => {
      // Первый findUnique — проверка «чат уже есть» (null), второй — разбор гонки.
      prisma.chat.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...chatRow({ id: 'c-12', type: 'ticket', ticketId: 't-3' }),
        members: [memberRow({ chatId: 'c-12' })],
      });
      tickets.getParticipants.mockResolvedValue(null);
      prisma.chat.create.mockRejectedValue({ code: 'P2002' });

      const chat = await service.createChat({ type: 'ticket', ticketId: 't-3' }, admin);
      expect(chat.id).toBe('c-12');
    });

    it('P2002 не по ticketId не подменяется на 500 «No Chat found»', async () => {
      // Именно этот сценарий ломал POST /api/chat/chats: конфликт приходил от
      // другого индекса, а findUniqueOrThrow по ticketId отдавал NotFoundError → 500.
      prisma.chat.findUnique.mockResolvedValue(null);
      tickets.getParticipants.mockResolvedValue(null);
      const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      prisma.chat.create.mockRejectedValue(conflict);

      await expect(service.createChat({ type: 'ticket', ticketId: 't-4' }, admin)).rejects.toBe(
        conflict,
      );
    });
  });

  describe('createChat (object)', () => {
    it('требует objectId', async () => {
      await expect(service.createChat({ type: 'object' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('запрещает CLIENT создавать чат объекта', async () => {
      await expect(
        service.createChat({ type: 'object', objectId: 'o-1' }, clientRole),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('создаёт чат объекта и закрепляет создателя', async () => {
      prisma.chat.findFirst.mockResolvedValueOnce(null);
      core.objectExists.mockResolvedValue(true);
      prisma.chat.create.mockResolvedValue({
        ...chatRow({ id: 'c-20', type: 'object', objectId: 'o-1' }),
        members: [memberRow({ chatId: 'c-20' })],
      });

      const chat = await service.createChat(
        { type: 'object', objectId: 'o-1', title: 'Офис' },
        admin,
      );
      expect(chat.id).toBe('c-20');
      expect(core.objectExists).toHaveBeenCalledWith('o-1');
      // Ищем именно OBJECT-чат объекта, а не любую строку с этим objectId.
      expect(prisma.chat.findFirst).toHaveBeenCalledWith({
        where: { type: 'object', objectId: 'o-1' },
        include: { members: true },
      });
    });

    it('несуществующий объект → 400', async () => {
      prisma.chat.findFirst.mockResolvedValueOnce(null);
      core.objectExists.mockResolvedValue(false);
      await expect(
        service.createChat({ type: 'object', objectId: 'ghost' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('недоступный core-service не блокирует создание чата', async () => {
      prisma.chat.findFirst.mockResolvedValueOnce(null);
      core.objectExists.mockResolvedValue(null);
      prisma.chat.create.mockResolvedValue({
        ...chatRow({ id: 'c-21', type: 'object', objectId: 'o-2' }),
        members: [memberRow({ chatId: 'c-21' })],
      });

      await expect(
        service.createChat({ type: 'object', objectId: 'o-2' }, supervisor),
      ).resolves.toMatchObject({ id: 'c-21' });
    });

    it('существующий чат объекта: возвращает его и добавляет вызывающего', async () => {
      prisma.chat.findFirst.mockResolvedValueOnce(
        chatRow({ id: 'c-22', type: 'object', objectId: 'o-1' }),
      );
      prisma.chatMember.upsert.mockResolvedValue({});
      prisma.chat.findUniqueOrThrow.mockResolvedValue({
        ...chatRow({ id: 'c-22', type: 'object', objectId: 'o-1' }),
        members: [memberRow({ chatId: 'c-22', userId: 'u-super' })],
      });

      const chat = await service.createChat({ type: 'object', objectId: 'o-1' }, supervisor);
      expect(chat.id).toBe('c-22');
      expect(prisma.chatMember.upsert).toHaveBeenCalledWith({
        where: { chatId_userId: { chatId: 'c-22', userId: 'u-super' } },
        create: { chatId: 'c-22', userId: 'u-super', role: 'creator' },
        update: {},
      });
    });

    it('гонка create объекта (P2002) → существующий чат', async () => {
      prisma.chat.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...chatRow({ id: 'c-23', type: 'object', objectId: 'o-3' }),
        members: [memberRow({ chatId: 'c-23' })],
      });
      core.objectExists.mockResolvedValue(true);
      prisma.chat.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createChat({ type: 'object', objectId: 'o-3' }, admin),
      ).resolves.toMatchObject({ id: 'c-23' });
    });

    it('P2002 без object-чата на месте → 409, а не 500', async () => {
      // Так выглядел бы legacy-стек: objectId занят чатом другого типа.
      // Понятный конфликт вместо «No Chat found» из findUniqueOrThrow.
      prisma.chat.findFirst.mockResolvedValue(null);
      core.objectExists.mockResolvedValue(true);
      prisma.chat.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createChat({ type: 'object', objectId: 'o-4' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createChat (system)', () => {
    it('создаёт system-чат только для ADMIN', async () => {
      prisma.chat.create.mockResolvedValue({
        ...chatRow({ id: 'c-30', type: 'system', title: 'Системные уведомления' }),
        members: [memberRow({ chatId: 'c-30' })],
      });

      const chat = await service.createChat({ type: 'system' }, admin);
      expect(chat.type).toBe('system');
      expect(prisma.chat.create.mock.calls[0][0].data.title).toBe('Системные уведомления');
    });

    it('SUPERVISOR не может создать system-чат', async () => {
      await expect(service.createChat({ type: 'system' }, supervisor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------- доступ

  describe('getChat и проверки доступа', () => {
    it('несуществующий чат → 404', async () => {
      prisma.chat.findUnique.mockResolvedValue(null);
      await expect(service.getChat('ghost', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('чужой direct-чат → 403 «Вы не участник этого чата»', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(service.getChat('c-1', operator)).rejects.toThrow('Вы не участник этого чата');
    });

    it('участник получает деталь с участниками', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      prisma.chatMember.findMany.mockResolvedValue([
        memberRow({ userId: 'u-admin' }),
        memberRow({ id: 'm-2', userId: 'u-oper', joinedAt: new Date('2026-01-01T11:00:00.000Z') }),
      ]);

      const chat = await service.getChat('c-1', admin);
      expect(chat.members.map((member) => member.userId)).toEqual(['u-admin', 'u-oper']);
      expect(chat.members[0].lastReadAt).toBeNull();
    });

    it('ADMIN видит ticket-чат и закрепляется участником', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'ticket', ticketId: 't-1' }));
      prisma.chatMember.findUnique.mockResolvedValue(null);
      prisma.chatMember.upsert.mockResolvedValue({});
      prisma.chatMember.findMany.mockResolvedValue([memberRow({ userId: 'u-admin' })]);

      await service.getChat('c-1', admin);

      expect(prisma.chatMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { chatId: 'c-1', userId: 'u-admin', role: 'staff' },
        }),
      );
    });

    it('OPERATOR не видит object-чат объекта, к которому не привязан', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'object', objectId: 'o-1' }));
      prisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(service.getChat('c-1', operator)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('участник заявки (исполнитель) получает доступ к ticket-чату', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'ticket', ticketId: 't-1' }));
      prisma.chatMember.findUnique.mockResolvedValue(null);
      tickets.getParticipants.mockResolvedValue({
        id: 't-1',
        objectId: 'o-1',
        assigneeId: 'u-oper',
        assigneeIds: ['u-oper'],
        createdBy: 'u-client',
      });
      prisma.chatMember.upsert.mockResolvedValue({});
      prisma.chatMember.findMany.mockResolvedValue([memberRow({ userId: 'u-oper' })]);

      await expect(service.getChat('c-1', operator)).resolves.toMatchObject({ id: 'c-1' });
      expect(prisma.chatMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { chatId: 'c-1', userId: 'u-oper', role: 'participant' },
        }),
      );
    });

    it('CLIENT вне заявки не получает доступ к ticket-чату', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'ticket', ticketId: 't-1' }));
      prisma.chatMember.findUnique.mockResolvedValue(null);
      tickets.getParticipants.mockResolvedValue({
        id: 't-1',
        objectId: 'o-1',
        assigneeId: 'u-oper',
        assigneeIds: ['u-oper'],
        createdBy: 'u-other-client',
      });

      await expect(service.getChat('c-1', clientRole)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('isMember возвращает признак участия', async () => {
      prisma.chatMember.findUnique.mockResolvedValueOnce({ id: 'm-1' }).mockResolvedValueOnce(null);
      await expect(service.isMember('c-1', 'u-admin')).resolves.toBe(true);
      await expect(service.isMember('c-1', 'u-oper')).resolves.toBe(false);
    });

    it('getMemberIds возвращает только идентификаторы', async () => {
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-1' }, { userId: 'u-2' }]);
      await expect(service.getMemberIds('c-1')).resolves.toEqual(['u-1', 'u-2']);
    });
  });

  // ------------------------------------------------------------ история

  describe('listMessages', () => {
    it('несуществующий чат → 404', async () => {
      prisma.chat.findUnique.mockResolvedValue(null);
      await expect(service.listMessages('ghost', {}, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('чужой чат → 403', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(service.listMessages('c-1', {}, operator)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('пагинация: страница отдаётся от старых к новым, есть курсор выше', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      // DESC-выборка + один «лишний» элемент → hasMore = true.
      prisma.message.findMany.mockResolvedValue([
        messageRow({ id: 'm-3', createdAt: new Date('2026-01-01T12:00:00.000Z') }),
        messageRow({ id: 'm-2', createdAt: new Date('2026-01-01T11:00:00.000Z') }),
        messageRow({ id: 'm-1', createdAt: new Date('2026-01-01T10:00:00.000Z') }),
      ]);

      const page = await service.listMessages('c-1', { limit: 2 }, admin);

      expect(page.items.map((item) => item.id)).toEqual(['m-2', 'm-3']);
      expect(page.hasMore).toBe(true);
      expect(page.nextBefore).toBe('2026-01-01T11:00:00.000Z');
      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(3);
    });

    it('последняя страница: hasMore=false и без курсора', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      prisma.message.findMany.mockResolvedValue([messageRow({ id: 'm-1' })]);

      const page = await service.listMessages('c-1', { limit: 50 }, admin);
      expect(page.hasMore).toBe(false);
      expect(page.nextBefore).toBeNull();
      expect(page.items).toHaveLength(1);
    });

    it('курсор before ограничивает выборку и ограничивается сверху 100', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      prisma.message.findMany.mockResolvedValue([]);

      await service.listMessages('c-1', { before: '2026-01-01T09:00:00.000Z', limit: 1000 }, admin);

      const where = prisma.message.findMany.mock.calls[0][0];
      expect(where.where.createdAt).toEqual({ lt: new Date('2026-01-01T09:00:00.000Z') });
      expect(where.take).toBe(101);
    });

    it('пустой чат возвращает пустую страницу', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      prisma.message.findMany.mockResolvedValue([]);

      const page = await service.listMessages('c-1', {}, admin);
      expect(page.items).toEqual([]);
      expect(page.limit).toBe(50);
    });

    it('загрузка истории помечает чужие недоставленные (deliveredAt)', async () => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
      prisma.message.findMany.mockResolvedValue([]);

      await service.listMessages('c-1', {}, admin);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { chatId: 'c-1', authorId: { not: 'u-admin' }, deliveredAt: null },
        data: { deliveredAt: expect.any(Date) },
      });
    });
  });

  // ------------------------------------------------------------ отправка

  describe('sendMessage', () => {
    beforeEach(() => {
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'direct', title: 'Диалог' }));
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
    });

    it('несуществующий чат → 404', async () => {
      prisma.chat.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('ghost', { text: 'привет' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('чужой чат → 403', async () => {
      prisma.chatMember.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('c-1', { text: 'привет' }, operator)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('пустой текст (пробелы) → 400', async () => {
      await expect(service.sendMessage('c-1', { text: '   ' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('сохраняет сообщение и считает оффлайн-получателей', async () => {
      prisma.message.create.mockResolvedValue(messageRow({ id: 'm-10', authorId: 'u-admin' }));
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage('c-1', { text: ' привет ' }, admin, ['u-admin']);

      expect(plan.message.id).toBe('m-10');
      expect(plan.recipientIds).toEqual(['u-oper']);
      expect(plan.offlineIds).toEqual(['u-oper']);
      expect(prisma.message.create.mock.calls[0][0].data.text).toBe('привет');
      // Push уходит оффлайн-получателю.
      expect(push.calls).toHaveLength(1);
      expect(push.calls[0].userIds).toEqual(['u-oper']);
      expect(push.calls[0].data.chatId).toBe('c-1');
    });

    it('онлайн-получатель не получает push, но входит в рассылку', async () => {
      prisma.message.create.mockResolvedValue(messageRow({ id: 'm-11', authorId: 'u-admin' }));
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage('c-1', { text: 'онлайн?' }, admin, [
        'u-admin',
        'u-oper',
      ]);

      expect(plan.offlineIds).toEqual([]);
      expect(push.calls).toHaveLength(0);
    });

    it('дедуплицирует вложения и не падает при ошибке push', async () => {
      prisma.message.create.mockResolvedValue(messageRow({ id: 'm-12', authorId: 'u-admin' }));
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-oper' }]);
      (push.notifyOffline as jest.Mock).mockRejectedValueOnce(new Error('notification down'));

      const plan = await service.sendMessage(
        'c-1',
        { text: 'файл', attachmentIds: ['f-1', 'f-1'] },
        admin,
      );

      expect(prisma.message.create.mock.calls[0][0].data.attachmentIds).toEqual(['f-1']);
      expect(plan.message.id).toBe('m-12');
    });

    it('длинный текст обрезается в push-превью', async () => {
      prisma.message.create.mockResolvedValue(
        messageRow({ id: 'm-13', authorId: 'u-admin', text: 'очень длинное сообщение для пуша' }),
      );
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-oper' }]);

      await service.sendMessage('c-1', { text: 'очень длинное сообщение для пуша' }, admin);
      expect(push.calls[0].body).toBe('очень длин…');
      expect(push.calls[0].title).toBe('Диалог');
    });

    it('сохраняет clientMessageId и отдаёт duplicate=false в первый раз', async () => {
      prisma.message.create.mockResolvedValue(
        messageRow({ id: 'm-20', authorId: 'u-admin', clientMessageId: 'client-1' }),
      );
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage(
        'c-1',
        { text: 'привет', clientMessageId: 'client-1' },
        admin,
        ['u-admin'],
      );

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { authorId_clientMessageId: { authorId: 'u-admin', clientMessageId: 'client-1' } },
      });
      expect(prisma.message.create.mock.calls[0][0].data.clientMessageId).toBe('client-1');
      expect(plan.duplicate).toBe(false);
    });

    it('повтор с тем же clientMessageId → duplicate=true, без create и push', async () => {
      prisma.message.findUnique.mockResolvedValue(
        messageRow({ id: 'm-21', authorId: 'u-admin', clientMessageId: 'client-1' }),
      );
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage(
        'c-1',
        { text: 'привет', clientMessageId: 'client-1' },
        admin,
        [],
      );

      expect(plan.duplicate).toBe(true);
      expect(plan.message.id).toBe('m-21');
      expect(plan.recipientIds).toEqual(['u-oper']);
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(push.calls).toHaveLength(0);
    });

    it('гонка параллельных повторов: P2002 → отдаёт сообщение победителя', async () => {
      const winner = messageRow({ id: 'm-22', authorId: 'u-admin', clientMessageId: 'client-1' });
      prisma.message.findUnique
        .mockResolvedValueOnce(null) // предварительная проверка: ещё нет
        .mockResolvedValueOnce(winner); // после P2002: создан параллельно
      prisma.message.create.mockRejectedValue({ code: 'P2002' });
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage(
        'c-1',
        { text: 'привет', clientMessageId: 'client-1' },
        admin,
      );

      expect(plan.duplicate).toBe(true);
      expect(plan.message.id).toBe('m-22');
    });

    it('онлайн-получатель → deliveredAt проставлен в ответе', async () => {
      prisma.message.create.mockResolvedValue(messageRow({ id: 'm-23', authorId: 'u-admin' }));
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage('c-1', { text: 'онлайн' }, admin, [
        'u-admin',
        'u-oper',
      ]);

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm-23' },
        data: { deliveredAt: expect.any(Date) },
      });
      expect(plan.message.deliveredAt).toEqual(expect.any(String));
    });

    it('все получатели оффлайн → deliveredAt остаётся null', async () => {
      prisma.message.create.mockResolvedValue(messageRow({ id: 'm-24', authorId: 'u-admin' }));
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-oper' }]);

      const plan = await service.sendMessage('c-1', { text: 'оффлайн' }, admin, []);

      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(plan.message.deliveredAt).toBeNull();
    });
  });

  // ---------------------------------------------------------- прочтение

  describe('markRead', () => {
    beforeEach(() => {
      prisma.chat.findUnique.mockResolvedValue(chatRow());
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1' });
    });

    it('несуществующий чат → 404', async () => {
      prisma.chat.findUnique.mockResolvedValue(null);
      await expect(
        service.markRead('ghost', { lastMessageId: 'm-1' }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('чужой чат → 403', async () => {
      prisma.chatMember.findUnique.mockResolvedValue(null);
      await expect(
        service.markRead('c-1', { lastMessageId: 'm-1' }, operator),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('сообщения нет в этом чате → 404', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(
        service.markRead('c-1', { lastMessageId: 'm-other' }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('проставляет lastReadAt = createdAt сообщения и сообщает автора', async () => {
      prisma.message.findFirst.mockResolvedValue(messageRow({ id: 'm-5', authorId: 'u-oper' }));
      prisma.chatMember.findUnique.mockResolvedValue({
        id: 'm-1',
        lastReadAt: new Date('2026-01-01T09:00:00.000Z'),
      });
      prisma.chatMember.update.mockResolvedValue({});

      const result = await service.markRead('c-1', { lastMessageId: 'm-5' }, admin);

      expect(result.readAt).toBe(NOW.toISOString());
      expect(result.authorId).toBe('u-oper');
      expect(prisma.chatMember.update).toHaveBeenCalledWith({
        where: { chatId_userId: { chatId: 'c-1', userId: 'u-admin' } },
        data: { lastReadAt: NOW },
      });
    });

    it('идемпотентна: повторное чтение старого сообщения не двигает lastReadAt', async () => {
      prisma.message.findFirst.mockResolvedValue(
        messageRow({ id: 'm-4', createdAt: new Date('2026-01-01T08:00:00.000Z') }),
      );
      prisma.chatMember.findUnique.mockResolvedValue({
        id: 'm-1',
        lastReadAt: new Date('2026-01-01T09:00:00.000Z'),
      });

      await service.markRead('c-1', { lastMessageId: 'm-4' }, admin);
      expect(prisma.chatMember.update).not.toHaveBeenCalled();
    });

    it('создаёт участника, если доступ был через роль/заявку', async () => {
      prisma.chatMember.findUnique
        .mockResolvedValueOnce(null) // assertCanView: не участник
        .mockResolvedValueOnce(null); // markRead: записи нет
      prisma.chat.findUnique.mockResolvedValue(chatRow({ type: 'object', objectId: 'o-1' }));
      prisma.chatMember.upsert.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(messageRow({ id: 'm-6', authorId: 'u-admin' }));
      prisma.chatMember.create.mockResolvedValue({});

      const result = await service.markRead('c-1', { lastMessageId: 'm-6' }, supervisor);

      expect(result.authorId).toBe('u-admin');
      expect(prisma.chatMember.create).toHaveBeenCalledWith({
        data: { chatId: 'c-1', userId: 'u-super', role: 'participant', lastReadAt: NOW },
      });
    });

    it('своё сообщение не порождает уведомление автору', async () => {
      prisma.message.findFirst.mockResolvedValue(messageRow({ id: 'm-7', authorId: 'u-admin' }));
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1', lastReadAt: null });
      prisma.chatMember.update.mockResolvedValue({});

      const result = await service.markRead('c-1', { lastMessageId: 'm-7' }, admin);
      expect(result.authorId).toBeNull();
    });

    it('прочтение помечает чужие недоставленные до момента чтения', async () => {
      prisma.message.findFirst.mockResolvedValue(messageRow({ id: 'm-8', authorId: 'u-oper' }));
      prisma.chatMember.findUnique.mockResolvedValue({ id: 'm-1', lastReadAt: null });
      prisma.chatMember.update.mockResolvedValue({});

      await service.markRead('c-1', { lastMessageId: 'm-8' }, admin);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          chatId: 'c-1',
          authorId: { not: 'u-admin' },
          deliveredAt: null,
          createdAt: { lte: NOW },
        },
        data: { deliveredAt: expect.any(Date) },
      });
    });
  });

  // ------------------------------------------------------------- поиск

  describe('deleteMessage (только ADMIN, 14.10.2026)', () => {
    const adminUser = { id: 'u-admin', email: 'a@b.c', role: 'ADMIN' as const, fullName: '' };
    const operatorUser = { id: 'u-op', email: 'o@b.c', role: 'OPERATOR' as const, fullName: '' };

    it('удаляет строку и отдаёт участников чата для рассылки', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm-1', chatId: 'c-1', authorId: 'u-op' });
      prisma.message.delete.mockResolvedValue({ id: 'm-1' });
      prisma.chatMember.findMany.mockResolvedValue([{ userId: 'u-admin' }, { userId: 'u-op' }]);
      await expect(service.deleteMessage('m-1', adminUser)).resolves.toEqual({
        chatId: 'c-1',
        messageId: 'm-1',
        deletedBy: 'u-admin',
        memberIds: ['u-admin', 'u-op'],
      });
      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    });

    it('не ADMIN → 403 без обращения к базе', async () => {
      await expect(service.deleteMessage('m-1', operatorUser)).rejects.toThrow(ForbiddenException);
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.message.delete).not.toHaveBeenCalled();
    });

    it('нет сообщения → 404', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.deleteMessage('missing', adminUser)).rejects.toThrow(NotFoundException);
      expect(prisma.message.delete).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('пустая строка → 400', async () => {
      await expect(service.search({ q: '   ' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('без участия в чатах ничего не ищет', async () => {
      prisma.chatMember.findMany.mockResolvedValue([]);
      await expect(service.search({ q: 'заявка' }, operator)).resolves.toEqual({
        items: [],
        total: 0,
      });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('ищет только по чатам пользователя', async () => {
      prisma.chatMember.findMany.mockResolvedValue([{ chatId: 'c-1' }, { chatId: 'c-2' }]);
      prisma.message.findMany.mockResolvedValue([messageRow({ text: 'про заявку' })]);
      prisma.message.count.mockResolvedValue(1);

      const result = await service.search({ q: 'заявк' }, operator);

      const where = prisma.message.findMany.mock.calls[0][0].where;
      expect(where.chatId).toEqual({ in: ['c-1', 'c-2'] });
      expect(where.text).toEqual({ contains: 'заявк', mode: 'insensitive' });
      expect(result.total).toBe(1);
      expect(result.items[0].text).toBe('про заявку');
    });

    it('чужой chatId → 403 (а не пустой результат)', async () => {
      prisma.chatMember.findMany.mockResolvedValue([{ chatId: 'c-1' }]);
      await expect(service.search({ q: 'заявка', chatId: 'c-foreign' }, operator)).rejects.toThrow(
        'Вы не участник этого чата',
      );
    });

    it('свой chatId ограничивает область поиска и лимит', async () => {
      prisma.chatMember.findMany.mockResolvedValue([{ chatId: 'c-1' }, { chatId: 'c-2' }]);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.search({ q: 'a', chatId: 'c-2', limit: 5 }, operator);

      expect(prisma.message.findMany.mock.calls[0][0].where.chatId).toEqual({ in: ['c-2'] });
      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(5);
    });
  });

  it('isUniqueViolation распознаёт только P2002', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2003' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});
