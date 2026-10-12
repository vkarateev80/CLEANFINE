import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Device, Notification, Prisma } from '@prisma/client';
import { errorMessage } from '../common/error.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChatMessagePushDto,
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdateSettingsDto,
} from './dto/notifications.dto';
import {
  renderTemplate,
  type RenderedNotification,
  type TemplateParams,
} from './notification-templates';
import { NOTIFICATION_TYPES, type NotificationType } from './notification-types';
import { StaffDirectoryService } from '../integration/staff-directory.service';
import { PUSH_SENDER, toPushData, type PushSender } from './push/push-sender';
import { WebPushSender } from './push/web-push.sender';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface NotificationsPage {
  items: Notification[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

export interface NotificationSettings {
  userId: string;
  disabledTypes: string[];
  availableTypes: readonly NotificationType[];
}

/** Сводка рассылки: сколько получателей реально получили уведомление. */
export interface ChatPushSummary {
  delivered: number;
}

/**
 * Ядро уведомлений (docs/agents/BACKEND_NOTIFICATIONS.md).
 *
 * Путь одного уведомления: настроить подписки → определить получателей →
 * отфильтровать по настройкам → отправить push (PushSender) → сохранить
 * in-app запись. In-app запись сохраняется даже без устройств: пользователь
 * увидит её в интерфейсе (polling/WS), а push — лишь ускорение доставки.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    private readonly webPush: WebPushSender,
    private readonly staff: StaffDirectoryService,
  ) {}

  /** Публичный ключ VAPID для подписки браузера; null — Web Push не настроен. */
  get webPushPublicKey(): string | null {
    return this.webPush.enabled ? this.webPush.publicKey : null;
  }

  /** Регистрация/обновление токена устройства: upsert по token. */
  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<Device> {
    const now = new Date();
    // Токен уникален: то же устройство, переустановив приложение, обновляет запись,
    // а не плодит дубликаты. Токен, «переехавший» к другому пользователю,
    // перепривязывается к новому владельцу.
    const device = await this.prisma.device.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        isActive: true,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: dto.platform,
        isActive: true,
        lastSeenAt: now,
      },
    });

    this.logger.log(`Устройство зарегистрировано: user=${userId} platform=${dto.platform}`);
    return device;
  }

  /**
   * Отписка токена при выходе (М6, DS-002 `profile.md` п. 11.2).
   * Удаляем строку: push больше не уходит. Чужой token не трогаем — where userId.
   */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    const { count } = await this.prisma.device.deleteMany({
      where: { userId, token },
    });
    if (count > 0) {
      this.logger.log(`Устройство отписано: user=${userId}`);
    }
  }

  /** In-app список уведомлений пользователя с пагинацией и фильтром непрочитанных. */
  async list(userId: string, query: ListNotificationsQueryDto): Promise<NotificationsPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly === true ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        // Второй ключ сортировки обязателен: события одного тика (ticket.created и
        // ticket.assigned) попадают в одну миллисекунду, и без tie-breaker Postgres
        // возвращает их в произвольном порядке — страницы page/limit пересекались.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items, total, page, limit, unreadCount };
  }

  /** Отметка прочитанного. Идемпотентна: повторный вызов возвращает ту же запись. */
  async markRead(userId: string, id: string): Promise<Notification> {
    // findFirst (а не findUnique) — отсекаем чужие уведомления: 404, а не 403,
    // чтобы не подтверждать существование чужих записей.
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (notification === null) {
      throw new NotFoundException('Уведомление не найдено');
    }
    if (notification.readAt !== null) {
      return notification;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Настройки подписок: по умолчанию включены все типы. */
  async getSettings(userId: string): Promise<NotificationSettings> {
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return {
      userId,
      disabledTypes: preference?.disabledTypes ?? [],
      availableTypes: NOTIFICATION_TYPES,
    };
  }

  /** Обновление настроек подписок (upsert: до первого изменения записи нет). */
  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<NotificationSettings> {
    // Дубликаты в запросе не должны попадать в БД как есть.
    const disabledTypes = Array.from(new Set(dto.disabledTypes));
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, disabledTypes },
      update: { disabledTypes },
    });
    this.logger.log(`Настройки уведомлений user=${userId}: отключено ${disabledTypes.length}`);
    return { userId, disabledTypes, availableTypes: NOTIFICATION_TYPES };
  }

  /** Типы, отключённые пользователем. */
  async getDisabledTypes(userId: string): Promise<string[]> {
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return preference?.disabledTypes ?? [];
  }

  /**
   * Получатели «широковещательного» уведомления: бригадиры и админы из
   * справочника auth-service плюс владельцы активных устройств. Используется,
   * когда контракт события не содержит получателя (ticket.emergency /
   * ticket.overdue / material.low). До 09.10.2026 — только устройства, и
   * веб-админка SOS не видела.
   */
  async resolveBroadcastRecipients(): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { isActive: true },
      distinct: ['userId'],
      select: { userId: true },
    });
    const recipients = new Set(devices.map((device) => device.userId));
    for (const userId of await this.resolveStaffRecipients()) {
      recipients.add(userId);
    }
    return Array.from(recipients);
  }

  /** Имя пользователя из справочника auth-service; null — недоступен/не найден. */
  async resolveUserName(userId: string): Promise<string | null> {
    try {
      return await this.staff.userName(userId);
    } catch (error) {
      this.logger.warn(`Справочник сотрудников недоступен: ${errorMessage(error)}`);
      return null;
    }
  }

  /** Активные бригадиры и админы (служебная аудитория). */
  async resolveStaffRecipients(): Promise<string[]> {
    try {
      return await this.staff.staffIds();
    } catch (error) {
      this.logger.warn(`Справочник сотрудников недоступен: ${errorMessage(error)}`);
      return [];
    }
  }

  /**
   * Уведомить одного пользователя: фильтр подписок → push → in-app запись.
   * Возвращает null, если тип отключён в настройках пользователя.
   */
  async notifyUser(
    userId: string,
    type: NotificationType,
    params: TemplateParams = {},
    data: Record<string, unknown> = {},
  ): Promise<Notification | null> {
    const disabledTypes = await this.getDisabledTypes(userId);
    if (disabledTypes.includes(type)) {
      this.logger.debug(`type=${type} отключён настройками user=${userId} — пропущено`);
      return null;
    }

    const rendered = renderTemplate(type, params);
    const devices = await this.getActiveDevices(userId);
    if (devices.length > 0) {
      await this.pushToDevices(userId, type, rendered, devices, data);
    } else {
      this.logger.log(`user=${userId} без активных устройств: push пропущен, только in-app`);
    }

    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title: rendered.title,
        body: rendered.body,
        payload: data as Prisma.InputJsonObject,
      },
    });
  }

  /**
   * Проверка доставки на устройства пользователя (кнопка «Проверить push»,
   * 12.10.2026): обычный путь notifyUser — настройки, push по всем активным
   * устройствам, in-app запись. Возвращает число устройств, чтобы клиент
   * объяснил «0 устройств — push на этом телефоне не включён».
   */
  async selfTest(userId: string): Promise<{ devices: number; notificationId: string | null }> {
    const devices = await this.prisma.device.count({ where: { userId, isActive: true } });
    const notification = await this.notifyUser(
      userId,
      'SYSTEM',
      {
        title: '🔔 Проверка уведомлений',
        body:
          devices > 0
            ? 'Push работает: это уведомление пришло на ваше устройство.'
            : 'Push на этом устройстве не включён — уведомление только в приложении.',
      },
      { kind: 'self-test' },
    );
    return { devices, notificationId: notification?.id ?? null };
  }

  /** Уведомить список пользователей (дубликаты отбрасываются). */
  async notifyUsers(
    userIds: string[],
    type: NotificationType,
    params: TemplateParams = {},
    data: Record<string, unknown> = {},
  ): Promise<number> {
    const unique = Array.from(new Set(userIds.filter((userId) => userId.length > 0)));
    const created = await Promise.all(
      unique.map((userId) => this.notifyUser(userId, type, params, data)),
    );
    return created.filter((notification) => notification !== null).length;
  }

  /**
   * Push сообщения чата оффлайн-получателям (М5.1). Вызывается внутренним
   * эндпоинтом, который дёргает chat-service, когда у получателя нет активного
   * WebSocket-соединения. Путь тот же, что у консьюмера событий: подписки
   * получателя → push (MockPushSender/FCM) → in-app запись, — поэтому логика не
   * дублируется, а переиспользуется через notifyUsers.
   *
   * Заголовок и текст приходят готовыми от отправителя (название чата и превью
   * сообщения) — они и есть параметры шаблона CHAT_MESSAGE. Возвращает сводку
   * с числом получателей, которым создана запись (без дублей).
   */
  async notifyChatMessage(dto: ChatMessagePushDto): Promise<ChatPushSummary> {
    const delivered = await this.notifyUsers(
      dto.userIds,
      'CHAT_MESSAGE',
      { title: dto.title, body: dto.body },
      dto.data ?? {},
    );
    this.logger.log(
      `Сообщение чата: уведомлено ${delivered} из ${dto.userIds.length} оффлайн-получателей`,
    );
    return { delivered };
  }

  private async getActiveDevices(userId: string): Promise<{ token: string; platform: string }[]> {
    return this.prisma.device.findMany({
      where: { userId, isActive: true },
      select: { token: true, platform: true },
    });
  }

  /**
   * Push по платформам: браузерные подписки (`web`) — Web Push (VAPID),
   * остальные токены — провайдер PUSH_SENDER (ntfy/mock). Недействительные
   * токены любого канала деактивируются.
   */
  private async pushToDevices(
    userId: string,
    type: NotificationType,
    rendered: RenderedNotification,
    devices: { token: string; platform: string }[],
    data: Record<string, unknown>,
  ): Promise<void> {
    const webTokens = devices.filter((d) => d.platform === 'web').map((d) => d.token);
    const nativeTokens = devices.filter((d) => d.platform !== 'web').map((d) => d.token);
    const message = {
      userId,
      template: type,
      title: rendered.title,
      body: rendered.body,
      priority: rendered.priority,
      data: toPushData(data),
    };
    const invalid: string[] = [];
    try {
      if (nativeTokens.length > 0) {
        const result = await this.push.send({ ...message, tokens: nativeTokens });
        invalid.push(...result.invalidTokens);
      }
      if (webTokens.length > 0) {
        const result = await this.webPush.send({ ...message, tokens: webTokens });
        invalid.push(...result.invalidTokens);
      }
      if (invalid.length > 0) {
        const count = await this.deactivateTokens(invalid);
        this.logger.warn(`Невалидные токены user=${userId}: деактивировано устройств ${count}`);
      }
    } catch (error) {
      // Падение push-провайдера не должно отменять in-app уведомление.
      this.logger.error(`Ошибка push user=${userId} type=${type}: ${errorMessage(error)}`);
    }
  }

  /** Деактивация устройств с невалидными токенами (UNREGISTERED/INVALID_ARGUMENT). */
  async deactivateTokens(tokens: string[]): Promise<number> {
    const { count } = await this.prisma.device.updateMany({
      where: { token: { in: tokens } },
      data: { isActive: false },
    });
    return count;
  }
}
