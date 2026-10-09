import { NotFoundException } from '@nestjs/common';
import type { Device, Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDeviceDto } from './dto/notifications.dto';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NotificationsService } from './notifications.service';
import { NOTIFICATION_TYPES } from './notification-types';
import type { PushMessage, PushSender } from './push/push-sender';
import type { WebPushSender } from './push/web-push.sender';
import type { StaffDirectoryService } from '../integration/staff-directory.service';

const VALID_TOKEN = 'fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789';

interface PrismaMock {
  device: { upsert: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock };
  notification: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  notificationPreference: { findUnique: jest.Mock; upsert: jest.Mock };
}

function createPrismaMock(): PrismaMock {
  return {
    device: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
}

function notificationOf(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    userId: 'u-1',
    type: 'NEW_TICKET',
    title: 'Новая задача',
    body: 'Вам назначена задача: Помыть',
    payload: { ticketId: 't-1' },
    readAt: null,
    createdAt: new Date('2026-01-01T09:00:00.000Z'),
    ...overrides,
  } as Notification;
}

describe('NotificationsService', () => {
  let prisma: PrismaMock;
  let push: { name: string; send: jest.Mock };
  let webPush: { enabled: boolean; publicKey: string | null; send: jest.Mock };
  let staff: { staffIds: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    push = {
      name: 'mock',
      send: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] }),
    };
    webPush = {
      enabled: false,
      publicKey: null,
      send: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] }),
    };
    staff = { staffIds: jest.fn().mockResolvedValue([]) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      push as unknown as PushSender,
      webPush as unknown as WebPushSender,
      staff as unknown as StaffDirectoryService,
    );
  });

  describe('registerDevice', () => {
    it('делает upsert по токену и возвращает устройство', async () => {
      const dto: RegisterDeviceDto = { token: VALID_TOKEN, platform: 'android' };
      const device = { id: 'd-1', ...dto, userId: 'u-1', isActive: true } as unknown as Device;
      prisma.device.upsert.mockResolvedValue(device);

      await expect(service.registerDevice('u-1', dto)).resolves.toBe(device);

      const args = prisma.device.upsert.mock.calls[0][0];
      // upsert по token: повторная регистрация того же устройства не создаёт дубликат.
      expect(args.where).toEqual({ token: VALID_TOKEN });
      expect(args.create).toMatchObject({
        userId: 'u-1',
        token: VALID_TOKEN,
        platform: 'android',
        isActive: true,
      });
      expect(args.update).toMatchObject({ userId: 'u-1', platform: 'android', isActive: true });
      expect(args.create.lastSeenAt).toBeInstanceOf(Date);
    });
  });

  describe('unregisterDevice', () => {
    it('удаляет токен только своего пользователя', async () => {
      prisma.device.deleteMany.mockResolvedValue({ count: 1 });

      await service.unregisterDevice('u-1', 'tok-1');

      expect(prisma.device.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', token: 'tok-1' },
      });
    });
  });

  describe('list', () => {
    it('по умолчанию отдаёт первую страницу и общее число непрочитанных', async () => {
      const items = [notificationOf()];
      prisma.notification.findMany.mockResolvedValue(items);
      prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const page = await service.list('u-1', {});

      expect(page).toEqual({ items, total: 1, page: 1, limit: DEFAULT_PAGE_SIZE, unreadCount: 1 });
      const args = prisma.notification.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'u-1' });
      expect(args.skip).toBe(0);
      expect(args.take).toBe(DEFAULT_PAGE_SIZE);
      // `id` вторым ключом: у записей одного тика одинаковый createdAt, и без
      // tie-breaker страницы page/limit пересекались (падало в e2e).
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('считает skip по странице и уважает фильтр непрочитанных', async () => {
      await service.list('u-1', { page: 3, limit: 5, unreadOnly: true });

      const args = prisma.notification.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(5);
      // readAt: null — фильтр непрочитанных на уровне БД, а не в памяти.
      expect(args.where).toEqual({ userId: 'u-1', readAt: null });
      expect(prisma.notification.count).toHaveBeenLastCalledWith({
        where: { userId: 'u-1', readAt: null },
      });
    });

    it('ограничивает размер страницы сверху', async () => {
      // Защита от запроса limit=100000: DTO тоже валидирует, но сервис не доверяет входу.
      await service.list('u-1', { limit: MAX_PAGE_SIZE * 5 });

      expect(prisma.notification.findMany.mock.calls[0][0].take).toBe(MAX_PAGE_SIZE);
    });

    it('unreadOnly=false не добавляет фильтр', async () => {
      await service.list('u-1', { unreadOnly: false });

      expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'u-1' });
    });
  });

  describe('markRead', () => {
    it('помечает уведомление прочитанным', async () => {
      const existing = notificationOf();
      prisma.notification.findFirst.mockResolvedValue(existing);
      const updated = notificationOf({ readAt: new Date('2026-01-02T10:00:00.000Z') });
      prisma.notification.update.mockResolvedValue(updated);

      await expect(service.markRead('u-1', 'n-1')).resolves.toBe(updated);
      // Ищем по паре (id, userId): чужие уведомления недоступны.
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-1', userId: 'u-1' },
      });
      expect(prisma.notification.update.mock.calls[0][0].data.readAt).toBeInstanceOf(Date);
    });

    it('идемпотентна: уже прочитанное не обновляется повторно', async () => {
      const read = notificationOf({ readAt: new Date('2026-01-02T10:00:00.000Z') });
      prisma.notification.findFirst.mockResolvedValue(read);

      await expect(service.markRead('u-1', 'n-1')).resolves.toBe(read);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('чужое или несуществующее уведомление → 404', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('u-1', 'n-404')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('настройки подписок', () => {
    it('без записи настроек все типы включены', async () => {
      await expect(service.getSettings('u-1')).resolves.toEqual({
        userId: 'u-1',
        disabledTypes: [],
        availableTypes: NOTIFICATION_TYPES,
      });
    });

    it('возвращает отключённые типы', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'u-1',
        disabledTypes: ['MATERIAL_LOW'],
      });

      await expect(service.getDisabledTypes('u-1')).resolves.toEqual(['MATERIAL_LOW']);
      await expect(service.getSettings('u-1')).resolves.toEqual({
        userId: 'u-1',
        disabledTypes: ['MATERIAL_LOW'],
        availableTypes: NOTIFICATION_TYPES,
      });
    });

    it('updateSettings делает upsert и убирает дубликаты', async () => {
      const settings = await service.updateSettings('u-1', {
        disabledTypes: ['MATERIAL_LOW', 'MATERIAL_LOW', 'GEOFENCE_EXIT'],
      });

      expect(settings).toEqual({
        userId: 'u-1',
        disabledTypes: ['MATERIAL_LOW', 'GEOFENCE_EXIT'],
        availableTypes: NOTIFICATION_TYPES,
      });
      expect(prisma.notificationPreference.upsert.mock.calls[0][0]).toMatchObject({
        where: { userId: 'u-1' },
        create: { userId: 'u-1', disabledTypes: ['MATERIAL_LOW', 'GEOFENCE_EXIT'] },
        update: { disabledTypes: ['MATERIAL_LOW', 'GEOFENCE_EXIT'] },
      });
    });
  });

  describe('resolveBroadcastRecipients', () => {
    it('собирает владельцев активных устройств без дублей', async () => {
      prisma.device.findMany.mockResolvedValue([{ userId: 'u-1' }, { userId: 'u-2' }]);

      await expect(service.resolveBroadcastRecipients()).resolves.toEqual(['u-1', 'u-2']);
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        distinct: ['userId'],
        select: { userId: true },
      });
    });
  
    it('добавляет бригадиров и админов из справочника (веб-админка без устройств)', async () => {
      prisma.device.findMany.mockResolvedValue([{ userId: 'u-1' }]);
      staff.staffIds.mockResolvedValue(['u-admin', 'u-1']);

      await expect(service.resolveBroadcastRecipients()).resolves.toEqual(['u-1', 'u-admin']);
    });

    it('недоступный справочник не ломает broadcast — остаются владельцы устройств', async () => {
      prisma.device.findMany.mockResolvedValue([{ userId: 'u-1' }]);
      staff.staffIds.mockRejectedValue(new Error('auth down'));

      await expect(service.resolveBroadcastRecipients()).resolves.toEqual(['u-1']);
    });
  });

  describe('web push', () => {
    it('браузерные подписки (platform=web) уходят в WebPushSender, остальные — в PUSH_SENDER', async () => {
      prisma.device.findMany.mockResolvedValue([
        { token: VALID_TOKEN, platform: 'android' },
        { token: '{"endpoint":"https://push","keys":{"p256dh":"k","auth":"a"}}', platform: 'web' },
      ]);
      prisma.notification.create.mockResolvedValue(notificationOf());

      await service.notifyUser('u-1', 'NEW_TICKET', { ticketDescription: 'Помыть' });

      expect(push.send).toHaveBeenCalledWith(expect.objectContaining({ tokens: [VALID_TOKEN] }));
      expect(webPush.send).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['{"endpoint":"https://push","keys":{"p256dh":"k","auth":"a"}}'],
        }),
      );
    });

    it('отозванная подписка (invalidTokens от WebPushSender) деактивирует устройство', async () => {
      const sub = '{"endpoint":"https://push","keys":{"p256dh":"k","auth":"a"}}';
      prisma.device.findMany.mockResolvedValue([{ token: sub, platform: 'web' }]);
      webPush.send.mockResolvedValue({ successCount: 0, failureCount: 1, invalidTokens: [sub] });
      prisma.notification.create.mockResolvedValue(notificationOf());

      await service.notifyUser('u-1', 'NEW_TICKET');

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { token: { in: [sub] } },
        data: { isActive: false },
      });
    });

    it('публичный ключ отдаётся только при настроенном Web Push', () => {
      expect(service.webPushPublicKey).toBeNull();
      webPush.enabled = true;
      webPush.publicKey = 'BPUBLIC';
      expect(service.webPushPublicKey).toBe('BPUBLIC');
    });
  });

  describe('notifyUser', () => {
    it('отключённый тип не доходит ни до push, ни до in-app', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'u-1',
        disabledTypes: ['EMERGENCY'],
      });

      await expect(service.notifyUser('u-1', 'EMERGENCY', {})).resolves.toBeNull();
      expect(push.send).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('без активных устройств сохраняет только in-app запись', async () => {
      prisma.notification.create.mockResolvedValue(notificationOf());

      await service.notifyUser(
        'u-1',
        'NEW_TICKET',
        { ticketDescription: 'Помыть 3 этаж' },
        { ticketId: 't-1' },
      );

      expect(push.send).not.toHaveBeenCalled();
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u-1',
        type: 'NEW_TICKET',
        title: 'Новая задача',
        body: 'Вам назначена задача: Помыть 3 этаж',
        payload: { ticketId: 't-1' },
      });
    });

    it('с устройством отправляет push и сохраняет in-app запись', async () => {
      prisma.device.findMany.mockResolvedValue([{ token: VALID_TOKEN }]);
      prisma.notification.create.mockResolvedValue(notificationOf());

      await service.notifyUser('u-1', 'MATERIAL_LOW', { materialName: 'Мыло', objectName: 'Офис' });

      const message = push.send.mock.calls[0][0] as PushMessage;
      expect(message).toMatchObject({
        userId: 'u-1',
        template: 'MATERIAL_LOW',
        priority: 'normal',
        tokens: [VALID_TOKEN],
      });
      expect(message.data).toEqual({});
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('деактивирует устройство с невалидным токеном', async () => {
      prisma.device.findMany.mockResolvedValue([{ token: VALID_TOKEN }, { token: 'bad-token' }]);
      prisma.notification.create.mockResolvedValue(notificationOf());
      push.send.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        invalidTokens: ['bad-token'],
      });

      await service.notifyUser('u-1', 'GEOFENCE_EXIT', { employeeName: 'Иванов' });

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { token: { in: ['bad-token'] } },
        data: { isActive: false },
      });
    });

    it('падение push-провайдера не отменяет in-app уведомление', async () => {
      prisma.device.findMany.mockResolvedValue([{ token: VALID_TOKEN }]);
      prisma.notification.create.mockResolvedValue(notificationOf());
      push.send.mockRejectedValue(new Error('FCM down'));

      await service.notifyUser('u-1', 'EMERGENCY', { type: 'Затопление', objectName: 'Офис' });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyUsers', () => {
    it('отбрасывает дубликаты и пустые id, считает только созданные записи', async () => {
      prisma.notificationPreference.findUnique.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === 'u-2' ? { userId: 'u-2', disabledTypes: ['NEW_TICKET'] } : null,
          ),
      );
      prisma.notification.create.mockResolvedValue(notificationOf());

      const notified = await service.notifyUsers(['u-1', 'u-1', '', 'u-2'], 'NEW_TICKET', {});

      // u-2 отписан от типа — в счётчик попадает одна доставка.
      expect(notified).toBe(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyChatMessage', () => {
    it('создаёт in-app уведомления каждому получателю и отдаёт сводку', async () => {
      prisma.notification.create.mockResolvedValue(notificationOf());

      const summary = await service.notifyChatMessage({
        userIds: ['u-1', 'u-2'],
        title: 'Чат по заявке T-1',
        body: 'Привет',
        data: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
      });

      expect(summary).toEqual({ delivered: 2 });
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        type: 'CHAT_MESSAGE',
        title: 'Чат по заявке T-1',
        body: 'Привет',
        payload: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
      });
    });

    it('не создаёт дубликатов по одному получателю', async () => {
      prisma.notification.create.mockResolvedValue(notificationOf());

      const summary = await service.notifyChatMessage({
        userIds: ['u-1', 'u-1', '', 'u-2', 'u-2'],
        title: 't',
        body: 'b',
      });

      // Дубликаты и пустые id отсекает notifyUsers — иначе оффлайн-получатель
      // получал бы по уведомлению на каждое повторение id в запросе.
      expect(summary).toEqual({ delivered: 2 });
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      // data не передан — payload пустой, а не undefined (колонка JSON NOT NULL).
      expect(prisma.notification.create.mock.calls[0][0].data.payload).toEqual({});
    });

    it('отправляет push с высоким приоритетом и data чата', async () => {
      prisma.device.findMany.mockResolvedValue([{ token: VALID_TOKEN }]);
      prisma.notification.create.mockResolvedValue(notificationOf());

      await service.notifyChatMessage({
        userIds: ['u-1'],
        title: 'Чат по заявке T-1',
        body: 'Привет',
        data: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
      });

      const message = push.send.mock.calls[0][0] as PushMessage;
      expect(message).toMatchObject({
        userId: 'u-1',
        template: 'CHAT_MESSAGE',
        title: 'Чат по заявке T-1',
        body: 'Привет',
        priority: 'high',
        tokens: [VALID_TOKEN],
        data: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
      });
    });

    it('уважает отключённый получателем тип CHAT_MESSAGE', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'u-1',
        disabledTypes: ['CHAT_MESSAGE'],
      });

      await expect(
        service.notifyChatMessage({ userIds: ['u-1'], title: 't', body: 'b' }),
      ).resolves.toEqual({ delivered: 0 });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(push.send).not.toHaveBeenCalled();
    });
  });

  describe('deactivateTokens', () => {
    it('возвращает число деактивированных устройств', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.deactivateTokens(['a', 'b', 'c'])).resolves.toBe(3);
    });
  });
});
