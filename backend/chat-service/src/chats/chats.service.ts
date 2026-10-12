import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Chat, ChatMember, Message, Prisma } from '@prisma/client';
import type { ChatType } from '@cleaning-ops/shared/types/chat';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/guards/roles.guard';
import { CHAT_PUSH_NOTIFIER, type ChatPushNotifier } from '../integration/notification-push.client';
import { CoreClient } from '../integration/core.client';
import { TicketClient } from '../integration/ticket.client';
import {
  DEFAULT_PAGE_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  MAX_PAGE_LIMIT,
  type CreateChatDto,
  type ListMessagesQueryDto,
  type MarkReadDto,
  type SearchMessagesQueryDto,
  type SendMessageDto,
} from './dto/chat.dto';

/** Краткое превью последнего сообщения для списка чатов. */
export interface LastMessagePreview {
  id: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
}

/** Элемент списка «мои чаты». */
export interface ChatSummary {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  lastMessage: LastMessagePreview | null;
  unreadCount: number;
}

/** Деталь чата: сам чат + участники. */
export interface ChatDetail {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  members: ChatMemberView[];
}

export interface ChatMemberView {
  userId: string;
  role: string | null;
  joinedAt: string;
  lastReadAt: string | null;
}

/** Ответ на отправку/чтение сообщения — то, что уходит в `message:new`. */
export interface MessageView {
  id: string;
  chatId: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
  /** Когда сообщение получил хотя бы один получатель; null — только отправлено. */
  deliveredAt: string | null;
}

/** Страница истории: items — от старых к новым внутри страницы, hasMore — есть ли ещё выше. */
export interface MessagesPage {
  items: MessageView[];
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
}

export interface SearchResult {
  items: MessageView[];
  total: number;
}

/** Результат доставки: кому нужно разослать `message:new` и кого нет в сети. */
export interface DeliveryPlan {
  message: MessageView;
  /** Все участники чата, кроме автора. */
  recipientIds: string[];
  /** Участники без активного соединения (для push). */
  offlineIds: string[];
  /**
   * Повтор с тем же clientMessageId: сообщение уже существовало, рассылку
   * message:new и push повторять нельзя — получатели уже получили его в первый раз.
   */
  duplicate: boolean;
}

export interface MarkReadResult {
  chatId: string;
  userId: string;
  lastMessageId: string;
  readAt: string;
  /** Автор последнего сообщения — ему отправляется `message:read`. */
  authorId: string | null;
}

/** Роли, которые видят чаты объектов и заявок целиком (М5.1, п.7). */
const STAFF_ROLES: readonly Role[] = ['ADMIN', 'SUPERVISOR'];

/**
 * Ядро чатов (М5.1–М5.2).
 *
 * Модель доступа (подробно — README):
 *  - участник ChatMember видит чат всегда;
 *  - ADMIN/SUPERVISOR видят OBJECT/TICKET-чаты (и получают участие в них);
 *  - TICKET-чат доступен также участникам заявки (assignee/createdBy) —
 *    проверка идёт через ticket-service с кэшем на 5 секунд;
 *  - DIRECT/SYSTEM — только явные участники.
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tickets: TicketClient,
    private readonly core: CoreClient,
    @Inject(CHAT_PUSH_NOTIFIER) private readonly push: ChatPushNotifier,
  ) {}

  private get previewLength(): number {
    return this.config.get<number>('chat.lastMessagePreviewLength') ?? 120;
  }

  // ------------------------------------------------------------------ список

  /** Чаты текущего пользователя, отсортированные по последнему сообщению (свежие выше). */
  async listMyChats(user: AuthUser): Promise<ChatSummary[]> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId: user.id },
      include: { chat: true },
    });
    if (memberships.length === 0) {
      return [];
    }

    const chatIds = memberships.map((member) => member.chatId);
    // Один запрос на все чаты: последние сообщения берём пачкой и оставляем
    // первое (самое новое) на чат — вместо N запросов в цикле.
    const recent = await this.prisma.message.findMany({
      where: { chatId: { in: chatIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const lastByChat = new Map<string, Message>();
    for (const message of recent) {
      if (!lastByChat.has(message.chatId)) {
        lastByChat.set(message.chatId, message);
      }
    }

    // Непрочитанные считаются от lastReadAt участника. Один запрос с OR по
    // персональным порогам дешевле, чем запрос на каждый чат.
    const unreadConditions: Prisma.MessageWhereInput[] = [];
    for (const member of memberships) {
      unreadConditions.push({
        chatId: member.chatId,
        authorId: { not: user.id },
        ...(member.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
      });
    }
    const unreadMessages = await this.prisma.message.findMany({
      where: { OR: unreadConditions },
      select: { chatId: true },
    });
    const unreadByChat = new Map<string, number>();
    for (const message of unreadMessages) {
      unreadByChat.set(message.chatId, (unreadByChat.get(message.chatId) ?? 0) + 1);
    }

    const summaries: ChatSummary[] = memberships.map((member) => {
      const chat = member.chat;
      const last = lastByChat.get(chat.id) ?? null;
      return {
        id: chat.id,
        type: chat.type as ChatType,
        title: chat.title,
        objectId: chat.objectId,
        ticketId: chat.ticketId,
        createdAt: chat.createdAt.toISOString(),
        lastMessage: last ? this.toLastMessagePreview(last) : null,
        unreadCount: unreadByChat.get(chat.id) ?? 0,
      };
    });

    // Сортировка «по последнему сообщению»: чаты без сообщений — по дате создания.
    return summaries.sort((a, b) => {
      const left = a.lastMessage?.createdAt ?? a.createdAt;
      const right = b.lastMessage?.createdAt ?? b.createdAt;
      return right.localeCompare(left);
    });
  }

  // ----------------------------------------------------------------- создание

  /** Создать чат. Для ticket/object повторный вызов возвращает существующий чат. */
  async createChat(dto: CreateChatDto, user: AuthUser): Promise<ChatDetail> {
    switch (dto.type) {
      case 'direct':
        return this.createDirectChat(dto, user);
      case 'ticket':
        return this.createTicketChat(dto, user);
      case 'object':
        return this.createObjectChat(dto, user);
      case 'system':
        return this.createSystemChat(dto, user);
      default:
        // class-validator отсекает неизвестные типы, сюда попасть нельзя.
        throw new BadRequestException('Недопустимый тип чата');
    }
  }

  /**
   * DIRECT: любой авторизованный. Себя добавляем всегда, второго участника
   * указывает создатель. Без второго участника чат создать нельзя — «чат с самим
   * собой» не имеет смысла, а фронт ждёт ровно двух собеседников.
   */
  private async createDirectChat(dto: CreateChatDto, user: AuthUser): Promise<ChatDetail> {
    const others = this.unique(dto.participantIds ?? []).filter((id) => id !== user.id);
    if (others.length !== 1) {
      throw new BadRequestException(
        'Для direct-чата укажите ровно одного второго участника (participantIds)',
      );
    }
    const participantId = others[0];
    const existing = await this.prisma.chat.findFirst({
      where: {
        type: 'direct',
        // Идемпотентность личного диалога: у обоих должна быть одна пара участников.
        AND: [
          { members: { some: { userId: user.id } } },
          { members: { some: { userId: participantId } } },
        ],
      },
      include: { members: true },
    });
    if (existing && existing.members.length === 2) {
      return this.toDetail(existing, existing.members);
    }

    const chat = await this.prisma.chat.create({
      data: {
        type: 'direct',
        title: dto.title ?? null,
        members: {
          create: [
            { userId: user.id, role: 'creator' },
            { userId: participantId, role: 'member' },
          ],
        },
      },
      include: { members: true },
    });
    this.logger.log(`direct-чат ${chat.id} создан: ${user.id} ↔ ${participantId}`);
    return this.toDetail(chat, chat.members);
  }

  /**
   * TICKET: только ADMIN/SUPERVISOR. Участники — автор заявки и все её
   * исполнители (плюс создатель чата). Повторное создание по ticketId
   * возвращает существующий чат (идемпотентность).
   */
  private async createTicketChat(dto: CreateChatDto, user: AuthUser): Promise<ChatDetail> {
    if (!dto.ticketId) {
      throw new BadRequestException('Для ticket-чата обязателен ticketId');
    }
    this.assertStaff(dto.type, user);

    const existing = await this.prisma.chat.findUnique({
      where: { ticketId: dto.ticketId },
      include: { members: true },
    });
    if (existing) {
      // Повторное создание — не ошибка: возвращаем тот же чат (контракт М5.1).
      await this.ensureMember(existing.id, user.id, 'creator');
      await this.syncTicketMembers(existing.id, dto.ticketId, user.id);
      const fresh = await this.prisma.chat.findUniqueOrThrow({
        where: { id: existing.id },
        include: { members: true },
      });
      return this.toDetail(fresh, fresh.members);
    }

    const participants = await this.tickets.getParticipants(dto.ticketId);
    if (participants === null) {
      // Недоступность ticket-service не должна запрещать создание чата:
      // чат остаётся валидным, участники доедут позже (syncTicketMembers).
      this.logger.warn(`ticket-чат по ${dto.ticketId}: участники не получены от ticket-service`);
    }

    const memberIds = this.unique([
      user.id,
      ...(dto.participantIds ?? []),
      ...(participants?.assigneeIds ?? []),
      ...(participants?.createdBy ? [participants.createdBy] : []),
    ]);

    try {
      const chat = await this.prisma.chat.create({
        data: {
          type: 'ticket',
          ticketId: dto.ticketId,
          // `objectId` НЕ заполняется: это поле закреплено за object-чатами и
          // имеет ГЛОБАЛЬНЫЙ уникальный индекс `Chat_objectId_key`. Раньше сюда
          // писался объект заявки, и вторая заявка того же объекта получала
          // P2002 на этом индексе (а обработка гонки искала чат по ticketId,
          // не находила и отдавала 500 «No Chat found»). Объект заявки всегда
          // доступен через ticket-service по `ticketId`.
          title: dto.title ?? null,
          members: { create: memberIds.map((userId) => ({ userId, role: 'member' })) },
        },
        include: { members: true },
      });
      this.logger.log(`ticket-чат ${chat.id} создан по заявке ${dto.ticketId}`);
      return this.toDetail(chat, chat.members);
    } catch (error) {
      // Гонка двух одновременных create: уникальный ticketId отдаёт P2002 —
      // вместо 500 возвращаем уже созданный чат (идемпотентность сохраняется).
      //
      // `findUniqueOrThrow` здесь нельзя: P2002 мог прийти от ЛЮБОГО индекса
      // (например, от ChatMember), и тогда отсутствие чата по ticketId — не
      // ошибка API, а признак того, что гонки по ticketId не было. Отдаём
      // исходную ошибку, а не подменяем её на «No Chat found».
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.chat.findUnique({
          where: { ticketId: dto.ticketId },
          include: { members: true },
        });
        if (raced) {
          return this.toDetail(raced, raced.members);
        }
        this.logger.warn(
          `ticket-чат по ${dto.ticketId}: P2002 не по ticketId — конфликт другого ограничения`,
        );
      }
      throw error;
    }
  }

  /** OBJECT: только ADMIN/SUPERVISOR. Повторное создание по objectId — тот же чат. */
  private async createObjectChat(dto: CreateChatDto, user: AuthUser): Promise<ChatDetail> {
    if (!dto.objectId) {
      throw new BadRequestException('Для object-чата обязателен objectId');
    }
    this.assertStaff(dto.type, user);

    // Ищем именно OBJECT-чат этого объекта: `objectId` уникален в пределах
    // таблицы, но запрос по типу делает намерение явным и не склеивает
    // object-чат с legacy-строкой другого типа (миграция
    // `m73_chat_objectid_only_object` такие строки уже вычищает).
    const existing = await this.prisma.chat.findFirst({
      where: { type: 'object', objectId: dto.objectId },
      include: { members: true },
    });
    if (existing) {
      await this.ensureMember(existing.id, user.id, 'creator');
      return this.reloadDetail(existing.id);
    }

    // Несуществующий объект — явная ошибка. Недоступность core-service (null)
    // не блокирует чат: связь людей важнее строгости проверки.
    const exists = await this.core.objectExists(dto.objectId);
    if (exists === false) {
      throw new BadRequestException('Объект не найден в core-service');
    }

    const memberIds = this.unique([user.id, ...(dto.participantIds ?? [])]);
    try {
      const chat = await this.prisma.chat.create({
        data: {
          type: 'object',
          objectId: dto.objectId,
          title: dto.title ?? null,
          members: { create: memberIds.map((userId) => ({ userId, role: 'member' })) },
        },
        include: { members: true },
      });
      this.logger.log(`object-чат ${chat.id} создан для объекта ${dto.objectId}`);
      return this.toDetail(chat, chat.members);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.chat.findFirst({
          where: { type: 'object', objectId: dto.objectId },
          include: { members: true },
        });
        if (raced) {
          return this.toDetail(raced, raced.members);
        }
        // P2002 без object-чата на месте — данные противоречат инварианту
        // «objectId только у object-чата». Это 409 с понятным текстом, а не 500.
        throw new ConflictException('Объектный чат не создан: objectId занят чатом другого типа');
      }
      throw error;
    }
  }

  /** SYSTEM: только ADMIN. Служебный канал уведомлений. */
  private async createSystemChat(dto: CreateChatDto, user: AuthUser): Promise<ChatDetail> {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Создавать system-чаты может только ADMIN');
    }
    const memberIds = this.unique([user.id, ...(dto.participantIds ?? [])]);
    const chat = await this.prisma.chat.create({
      data: {
        type: 'system',
        title: dto.title ?? 'Системные уведомления',
        members: { create: memberIds.map((userId) => ({ userId, role: 'member' })) },
      },
      include: { members: true },
    });
    this.logger.log(`system-чат ${chat.id} создан (${memberIds.length} участников)`);
    return this.toDetail(chat, chat.members);
  }

  // -------------------------------------------------------------------- доступ

  /** Деталь чата: не участник → 403, нет чата → 404. */
  async getChat(id: string, user: AuthUser): Promise<ChatDetail> {
    const chat = await this.prisma.chat.findUnique({ where: { id } });
    if (!chat) {
      throw new NotFoundException('Чат не найден');
    }
    await this.assertCanView(chat, user);
    const members = await this.prisma.chatMember.findMany({
      where: { chatId: id },
      orderBy: { joinedAt: 'asc' },
    });
    return this.toDetail(chat, members);
  }

  /**
   * Проверка доступа. Бросает 403 «Вы не участник этого чата» — текст
   * зафиксирован контрактом М5.1 (фронт показывает его в UI).
   */
  async assertCanView(chat: Chat, user: AuthUser): Promise<void> {
    if (await this.isMember(chat.id, user.id)) {
      return;
    }
    if (STAFF_ROLES.includes(user.role) && (chat.type === 'object' || chat.type === 'ticket')) {
      // Бригадир/админ видят чаты объектов и заявок; на всякий случай закрепляем
      // участие, чтобы дальше unread и история считались как у обычного участника.
      await this.ensureMember(chat.id, user.id, 'staff');
      return;
    }
    if (chat.type === 'ticket' && chat.ticketId) {
      const participants = await this.tickets.getParticipants(chat.ticketId);
      if (participants && this.isTicketParticipant(participants, user.id)) {
        await this.ensureMember(chat.id, user.id, 'participant');
        return;
      }
    }
    throw new ForbiddenException('Вы не участник этого чата');
  }

  /** Участник ли пользователь (без побочных эффектов). */
  async isMember(chatId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { id: true },
    });
    return member !== null;
  }

  /** Список участников чата — кому рассылать сообщение. */
  async getMemberIds(chatId: string): Promise<string[]> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  // ------------------------------------------------------------------ история

  /**
   * История сообщений с пагинацией по курсору `before`.
   *
   * Формат страницы: items идут от СТАРЫХ к НОВЫМ (как рисует чат в UI),
   * а курсор nextBefore указывает на createdAt самого старого сообщения
   * страницы — его передают в следующий запрос, чтобы подгрузить ещё выше.
   * Так фронт получает готовую к отрисовке страницу и не переворачивает массив.
   */
  async listMessages(
    chatId: string,
    query: ListMessagesQueryDto,
    user: AuthUser,
  ): Promise<MessagesPage> {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException('Чат не найден');
    }
    await this.assertCanView(chat, user);

    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const before = query.before ? new Date(query.before) : null;

    // Загрузка истории = устройство получило: чужие недоставленные помечаем
    // до чтения, чтобы страница сразу вернула deliveredAt (М6, п.11.2).
    await this.prisma.message.updateMany({
      where: { chatId, authorId: { not: user.id }, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });

    // Берём limit + 1 «сверху» (DESC), чтобы понять, есть ли ещё страница выше.
    const rows = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((message) => this.toView(message)).reverse();
    return {
      items,
      limit,
      hasMore,
      // nextBefore — createdAt самого старого сообщения страницы (items[0]).
      nextBefore: hasMore && items.length > 0 ? items[0].createdAt : null,
    };
  }

  // ------------------------------------------------------------------ отправка

  /**
   * Основной путь отправки (REST-фолбэк и WebSocket вызывают его же):
   * проверка участия → идемпотентность по clientMessageId → сохранение →
   * план доставки (онлайн/оффлайн).
   *
   * Повтор с тем же clientMessageId (ретрай после обрыва связи) возвращает
   * уже сохранённое сообщение с duplicate=true: вызывающий не рассылает
   * message:new и не шлёт push — получатели видели сообщение в первый раз.
   * Гонка двух параллельных повторов ловится уникальным индексом (P2002).
   */
  async sendMessage(
    chatId: string,
    dto: SendMessageDto,
    user: AuthUser,
    onlineUserIds: readonly string[] = [],
  ): Promise<DeliveryPlan> {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException('Чат не найден');
    }
    await this.assertCanView(chat, user);

    const text = (dto.text ?? '').trim();
    const attachmentIds = this.unique(dto.attachmentIds ?? []);
    // Пустой текст допустим только при вложениях (фото/видео в чате, 12.10.2026).
    if (text === '' && attachmentIds.length === 0) {
      throw new BadRequestException('Сообщение не может быть пустым');
    }
    const clientMessageId = dto.clientMessageId?.trim() || null;

    if (clientMessageId) {
      const existing = await this.prisma.message.findUnique({
        where: { authorId_clientMessageId: { authorId: user.id, clientMessageId } },
      });
      if (existing) {
        return this.duplicatePlan(existing, user);
      }
    }

    let message: Message;
    try {
      message = await this.prisma.message.create({
        data: {
          chatId,
          authorId: user.id,
          text,
          attachmentIds,
          ...(clientMessageId ? { clientMessageId } : {}),
        },
      });
    } catch (error) {
      // Два параллельных повтора с одним ключом: кто-то создал первым —
      // отдаём его сообщение, а не 500.
      if (clientMessageId && isUniqueViolation(error)) {
        const existing = await this.prisma.message.findUnique({
          where: { authorId_clientMessageId: { authorId: user.id, clientMessageId } },
        });
        if (existing) {
          return this.duplicatePlan(existing, user);
        }
      }
      throw error;
    }

    const memberIds = await this.getMemberIds(chatId);
    const recipientIds = memberIds.filter((userId) => userId !== user.id);
    const online = new Set(onlineUserIds);
    const offlineIds = recipientIds.filter((userId) => !online.has(userId));

    // «Доставлено»: событие уходит минимум в одно онлайн-устройство получателя.
    // Если все оффлайн — deliveredAt заполнится при загрузке истории или чтении.
    if (recipientIds.some((userId) => online.has(userId))) {
      const deliveredAt = new Date();
      await this.prisma.message.update({
        where: { id: message.id },
        data: { deliveredAt },
      });
      message = { ...message, deliveredAt };
    }

    if (offlineIds.length > 0) {
      await this.notifyOffline(chat, message, offlineIds);
    }

    return {
      message: this.toView(message),
      recipientIds,
      offlineIds,
      duplicate: false,
    };
  }

  /** План для уже существующего сообщения (повтор по clientMessageId). */
  private async duplicatePlan(existing: Message, user: AuthUser): Promise<DeliveryPlan> {
    const memberIds = await this.getMemberIds(existing.chatId);
    return {
      message: this.toView(existing),
      recipientIds: memberIds.filter((userId) => userId !== user.id),
      offlineIds: [],
      duplicate: true,
    };
  }

  /** Push оффлайн-получателям: не блокирует и не отменяет доставку в чат. */
  private async notifyOffline(chat: Chat, message: Message, offlineIds: string[]): Promise<void> {
    try {
      await this.push.notifyOffline({
        userIds: offlineIds,
        title: chat.title ?? 'Новое сообщение',
        body: previewText(message, this.previewLength),
        data: { chatId: chat.id, messageId: message.id, type: chat.type },
      });
    } catch (error) {
      this.logger.warn(
        `Push оффлайн-получателям не доставлен: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // -------------------------------------------------------------- прочтение

  /**
   * Отметка прочтения. lastReadAt = createdAt указанного сообщения (а не now):
   * повторное прочтение старого сообщения не «съедает» новые непрочитанные.
   */
  async markRead(chatId: string, dto: MarkReadDto, user: AuthUser): Promise<MarkReadResult> {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException('Чат не найден');
    }
    await this.assertCanView(chat, user);

    const message = await this.prisma.message.findFirst({
      where: { id: dto.lastMessageId, chatId },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено в этом чате');
    }

    const readAt = message.createdAt;
    // Прочтение включает доставку: чужие сообщения до момента чтения
    // устройство явно получило. Идемпотентно — affected = недоставленные.
    await this.prisma.message.updateMany({
      where: {
        chatId,
        authorId: { not: user.id },
        deliveredAt: null,
        createdAt: { lte: readAt },
      },
      data: { deliveredAt: new Date() },
    });
    const existing = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    });
    if (!existing) {
      await this.prisma.chatMember.create({
        data: { chatId, userId: user.id, role: 'participant', lastReadAt: readAt },
      });
    } else if (!existing.lastReadAt || existing.lastReadAt < readAt) {
      // Идемпотентно: отметка назад не откатывается.
      await this.prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: user.id } },
        data: { lastReadAt: readAt },
      });
    }

    // Автор прочитанного сообщения получает message:read; если сообщение своё —
    // уведомлять некого.
    return {
      chatId,
      userId: user.id,
      lastMessageId: message.id,
      readAt: readAt.toISOString(),
      authorId: message.authorId === user.id ? null : message.authorId,
    };
  }

  // -------------------------------------------------------------------- поиск

  /**
   * Поиск по тексту только по чатам, где пользователь участник.
   * ILIKE (Prisma `contains` + `mode: insensitive`) — минимум по контракту М5.2;
   * pg_trgm в базе включён, но индекс на выражении добавлять не стали, чтобы не
   * расширять схему без замера на реальном объёме.
   */
  async search(query: SearchMessagesQueryDto, user: AuthUser): Promise<SearchResult> {
    const q = query.q.trim();
    if (q === '') {
      throw new BadRequestException('Укажите строку поиска');
    }

    const memberships = await this.prisma.chatMember.findMany({
      where: { userId: user.id },
      select: { chatId: true },
    });
    const myChatIds = memberships.map((member) => member.chatId);

    // Явно указан чужой чат — 403, а не пустой результат: фронт должен знать,
    // что поиск по чужому чату запрещён, а не что «ничего не найдено».
    if (query.chatId && !myChatIds.includes(query.chatId)) {
      throw new ForbiddenException('Вы не участник этого чата');
    }
    const scope = query.chatId ? [query.chatId] : myChatIds;
    if (scope.length === 0) {
      return { items: [], total: 0 };
    }

    const limit = Math.min(query.limit ?? DEFAULT_SEARCH_LIMIT, MAX_PAGE_LIMIT);
    const where: Prisma.MessageWhereInput = {
      chatId: { in: scope },
      text: { contains: q, mode: 'insensitive' },
    };
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items: items.map((message) => this.toView(message)), total };
  }

  // ------------------------------------------------------------- вспомогательное

  private assertStaff(type: ChatType, user: AuthUser): void {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(`Создавать ${type}-чаты может только ADMIN или SUPERVISOR`);
    }
  }

  /** Добавляет участника, если его ещё нет (идемпотентно). */
  private async ensureMember(chatId: string, userId: string, role: string): Promise<void> {
    await this.prisma.chatMember.upsert({
      where: { chatId_userId: { chatId, userId } },
      create: { chatId, userId, role },
      update: {},
    });
  }

  /** Досинхронизирует участников ticket-чата с текущей заявкой. */
  private async syncTicketMembers(
    chatId: string,
    ticketId: string,
    creatorId: string,
  ): Promise<void> {
    const participants = await this.tickets.getParticipants(ticketId);
    if (participants === null) {
      return;
    }
    const ids = this.unique([
      creatorId,
      ...participants.assigneeIds,
      ...(participants.createdBy ? [participants.createdBy] : []),
    ]);
    for (const userId of ids) {
      await this.ensureMember(chatId, userId, 'participant');
    }
  }

  private async reloadDetail(chatId: string): Promise<ChatDetail> {
    const chat = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: { members: true },
    });
    return this.toDetail(chat, chat.members);
  }

  private isTicketParticipant(
    participants: { assigneeIds: string[]; createdBy: string | null },
    userId: string,
  ): boolean {
    return participants.assigneeIds.includes(userId) || participants.createdBy === userId;
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => typeof value === 'string' && value !== '')));
  }

  private toDetail(chat: Chat, members: ChatMember[]): ChatDetail {
    return {
      id: chat.id,
      type: chat.type as ChatType,
      title: chat.title,
      objectId: chat.objectId,
      ticketId: chat.ticketId,
      createdAt: chat.createdAt.toISOString(),
      members: members
        .map((member) => ({
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
          lastReadAt: member.lastReadAt ? member.lastReadAt.toISOString() : null,
        }))
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)),
    };
  }

  private toView(message: Message): MessageView {
    return {
      id: message.id,
      chatId: message.chatId,
      authorId: message.authorId,
      text: message.text,
      attachmentIds: message.attachmentIds,
      createdAt: message.createdAt.toISOString(),
      deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
    };
  }

  private toLastMessagePreview(message: Message): LastMessagePreview {
    return {
      id: message.id,
      authorId: message.authorId,
      text:
        previewText(message, this.previewLength),
      attachmentIds: message.attachmentIds,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

/** Prisma-уникальность (P2002): используется для идемпотентности создания чата. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

/** Превью сообщения: текст, а у сообщения без текста — подпись о вложении. */
export function previewText(
  message: { text: string; attachmentIds: string[] },
  limit: number,
): string {
  if (message.text.length === 0) {
    return message.attachmentIds.length > 1
      ? `📎 Вложения: ${message.attachmentIds.length}`
      : '📎 Вложение';
  }
  return message.text.length > limit ? `${message.text.slice(0, limit)}…` : message.text;
}
