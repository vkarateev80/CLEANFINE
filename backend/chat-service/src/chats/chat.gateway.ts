import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../auth/guards/roles.guard';
import { ChatsService, type DeliveryPlan, type MarkReadResult } from './chats.service';
import {
  authenticateSocket,
  CHAT_NAMESPACE,
  parseReadPayload,
  parseSendPayload,
  type IncomingMessagePayload,
  type IncomingReadPayload,
} from './ws-auth';

/** Ошибка клиенту в ack: код нужен фронту, чтобы отличить «нет прав» от «нет чата». */
export interface WsError {
  ok: false;
  error: string;
  status?: number;
}

/**
 * WebSocket-шлюз чата (М5.1). Namespace: /chat.
 *
 * Онлайн-карта: Map<userId, Set<socketId>>. В уставе пример с одним socketId на
 * пользователя, но один человек реально держит несколько вкладок/устройств —
 * с одним socketId закрытие второй вкладки «выбрасывало» бы его из онлайна.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: CHAT_NAMESPACE,
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  /** userId → набор socketId (несколько вкладок/устройств одного человека). */
  private readonly onlineUsers = new Map<string, Set<string>>();

  /** socketId → userId: нужен при disconnect, когда сокет уже недоступен. */
  private readonly socketOwners = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly chats: ChatsService,
  ) {}

  afterInit(): void {
    this.logger.log(`WebSocket-шлюз чата готов: namespace /${CHAT_NAMESPACE}`);
  }

  async handleConnection(client: Socket): Promise<void> {
    const auth = await authenticateSocket(this.jwt, client.handshake);
    if (!auth) {
      // Неавторизованное соединение не держим: клиент получит disconnect
      // с причиной «unauthorized» и повторит попытку с валидным токеном.
      this.logger.warn(`Соединение ${client.id} отклонено: нет валидного JWT`);
      client.emit('error', { message: 'Неавторизованное соединение: нужен access-токен' });
      client.disconnect(true);
      return;
    }

    const user = auth.user;
    // Полный пользователь хранится в данных сокета: обработчики событий не
    // должны повторно парсить токен.
    client.data.user = user;
    this.socketOwners.set(client.id, user.id);
    const sockets = this.onlineUsers.get(user.id) ?? new Set<string>();
    sockets.add(client.id);
    this.onlineUsers.set(user.id, sockets);
    // Личная комната = userId: адресная доставка без перебора сокетов.
    await client.join(userRoom(user.id));
    this.broadcastUserStatus(user.id, true);
    this.logger.log(`Пользователь ${user.id} онлайн (сокетов: ${sockets.size})`);
  }

  handleDisconnect(client: Socket): void {
    const userId = this.socketOwners.get(client.id);
    this.socketOwners.delete(client.id);
    if (!userId) {
      return;
    }
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);
        this.broadcastUserStatus(userId, false);
      }
    }
    this.logger.log(`Пользователь ${userId} оффлайн (сокет ${client.id})`);
  }

  /** Клиент → сервер: message:send { chatId, text, attachmentIds? }. */
  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: IncomingMessagePayload,
  ): Promise<{ ok: true; message: unknown } | WsError> {
    const user = this.userOf(client);
    if (!user) {
      return { ok: false, error: 'Соединение не авторизовано' };
    }
    const parsed = parseSendPayload(payload);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    try {
      // Отправитель входит в число онлайн-получателей, поэтому его сокеты
      // исключаются из рассылки отдельно: «кроме отправителя» из устава.
      const plan = await this.chats.sendMessage(
        parsed.value.chatId,
        {
          text: parsed.value.text,
          attachmentIds: parsed.value.attachmentIds,
          ...(parsed.value.clientMessageId
            ? { clientMessageId: parsed.value.clientMessageId }
            : {}),
        },
        user,
        this.getOnlineUserIds(),
      );

      // Дубль по clientMessageId: получатели уже видели сообщение в первый
      // раз — повторная рассыла создала бы второй пузырь. Ack отдаём тот же.
      if (!plan.duplicate) {
        this.emitMessageNew(plan, { excludeUserId: user.id });
      }
      // Ack отправителю — подтверждение сохранения (у устава ack не детализирован,
      // но клиенту нужен id и createdAt, чтобы отрисовать своё сообщение).
      return { ok: true, message: plan.message };
    } catch (error) {
      const status = httpStatusOf(error);
      this.logger.warn(
        `message:send отклонено (chatId=${parsed.value.chatId}): ${errorText(error)}`,
      );
      return { ok: false, error: errorText(error), status };
    }
  }

  /** Клиент → сервер: message:read { chatId, lastMessageId }. */
  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: IncomingReadPayload,
  ): Promise<{ ok: true; readAt: string } | WsError> {
    const user = this.userOf(client);
    if (!user) {
      return { ok: false, error: 'Соединение не авторизовано' };
    }
    const parsed = parseReadPayload(payload);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    try {
      const result = await this.chats.markRead(
        parsed.value.chatId,
        {
          lastMessageId: parsed.value.lastMessageId,
        },
        user,
      );
      this.emitMessageRead(result);
      return { ok: true, readAt: result.readAt };
    } catch (error) {
      return {
        ok: false,
        error: errorText(error),
        status: httpStatusOf(error),
      };
    }
  }

  // ------------------------------------------------------------------ рассылка

  /**
   * Рассылает message:new всем онлайн-участникам чата, кроме отправителя,
   * и в комнату чата (её слушают открытые окна чата).
   */
  emitMessageNew(plan: DeliveryPlan, options: { excludeUserId?: string } = {}): void {
    if (options.excludeUserId) {
      this.emitToUserExcept(plan.recipientIds, options.excludeUserId, 'message:new', plan.message);
      return;
    }
    for (const userId of plan.recipientIds) {
      this.server.to(userRoom(userId)).emit('message:new', plan.message);
    }
  }

  /** Уведомляет автора прочитанного сообщения событием message:read. */
  emitMessageRead(result: MarkReadResult): void {
    if (!result.authorId) {
      return;
    }
    this.server.to(userRoom(result.authorId)).emit('message:read', {
      chatId: result.chatId,
      messageId: result.lastMessageId,
      readBy: result.userId,
      readAt: result.readAt,
    });
  }

  /** Есть ли у пользователя активное соединение. */
  isOnline(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  /** Снимок онлайн-пользователей: передаётся в ChatsService для расчёта оффлайн-получателей. */
  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  /** Текущая онлайн-карта (диагностика/health). */
  getOnlineSnapshot(): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const [userId, sockets] of this.onlineUsers) {
      snapshot[userId] = sockets.size;
    }
    return snapshot;
  }

  /**
   * Онлайн/оффлайн статус: событие `user:status` в /chat.
   * Устав требует broadcastUserStatus, поэтому событие добавлено (клиенты,
   * которые его не слушают, просто игнорируют).
   */
  private broadcastUserStatus(userId: string, online: boolean): void {
    this.server?.emit('user:status', { userId, online });
  }

  /**
   * Личная комната пользователя: адресная доставка вместо перебора socketId —
   * сокеты вступают в комнату при подключении, поэтому мультивкладочность
   * работает без дополнительной логики.
   */
  private emitToUserExcept(
    recipientIds: string[],
    excludeUserId: string,
    event: string,
    payload: unknown,
  ): void {
    for (const userId of recipientIds) {
      if (userId === excludeUserId) {
        continue;
      }
      this.server.to(userRoom(userId)).emit(event, payload);
    }
  }

  private userOf(client: Socket): AuthUser | null {
    const user = (client.data as { user?: AuthUser }).user;
    if (!user || !user.id) {
      return null;
    }
    // Данные сокета неизменяемы после handshake, поэтому объект пользователя
    // кладётся в client.data в handleConnection и просто переиспользуется.
    return user;
  }
}

/** Комната пользователя: имя не должно совпадать с id чата. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

function errorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { message?: unknown } }).response;
    if (response && typeof response.message === 'string') {
      return response.message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Не удалось обработать событие';
}

function httpStatusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return undefined;
}
