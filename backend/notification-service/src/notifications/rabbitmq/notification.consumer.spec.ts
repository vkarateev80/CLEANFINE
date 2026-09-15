import { Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { MockPushSender } from '../push/mock-push.sender';
import { NotificationConsumer } from './notification.consumer';
import type { RabbitMessage } from './rabbitmq.service';
import { RabbitmqService } from './rabbitmq.service';

const VALID_TOKEN = 'fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789';
const BROADCAST_USERS = ['u-1', 'u-2'];

interface PrismaMock {
  device: { findMany: jest.Mock; updateMany: jest.Mock; upsert: jest.Mock };
  notification: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  notificationPreference: { findUnique: jest.Mock; upsert: jest.Mock };
}

function createPrismaMock(): PrismaMock {
  return {
    device: {
      // По умолчанию устройств нет: тесты, где нужен push,
      // настраивают выборку через devicesFindMany() или mockResolvedValue.
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notificationPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
  };
}

/** findMany устройств вызывается в двух режимах: токены пользователя и broadcast-список. */
function devicesFindMany(prisma: PrismaMock): void {
  prisma.device.findMany.mockImplementation(
    (args: { where?: { userId?: string }; select?: { token?: boolean } }) => {
      if (args.select?.token === true) {
        return Promise.resolve([{ token: VALID_TOKEN }]);
      }
      return Promise.resolve(BROADCAST_USERS.map((userId) => ({ userId })));
    },
  );
}

function build(): {
  prisma: PrismaMock;
  push: MockPushSender;
  rabbit: { subscribe: jest.Mock };
  consumer: NotificationConsumer;
} {
  const prisma = createPrismaMock();
  prisma.notification.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: `n-${String(prisma.notification.create.mock.calls.length)}`,
      readAt: null,
      createdAt: new Date(),
      ...args.data,
    } as unknown as Notification),
  );
  const push = new MockPushSender();
  const rabbit = { subscribe: jest.fn() };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    push,
  );
  const consumer = new NotificationConsumer(rabbit as unknown as RabbitmqService, service);

  return { prisma, push, rabbit, consumer };
}

function message(routingKey: string, payload: unknown): RabbitMessage {
  return { queue: `notification.${routingKey}`, routingKey, payload };
}

describe('NotificationConsumer', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('подписки', () => {
    it('подписывается на шесть очередей из общего контракта', () => {
      const { rabbit, consumer } = build();

      consumer.onModuleInit();

      expect(rabbit.subscribe.mock.calls.map((call) => call[0])).toEqual([
        'notification.ticket.created',
        'notification.ticket.assigned',
        'notification.ticket.emergency',
        'notification.ticket.overdue',
        'notification.geofence.exit',
        'notification.material.low',
      ]);
      expect(rabbit.subscribe.mock.calls.map((call) => call[1])).toEqual([
        'ticket.created',
        'ticket.assigned',
        'ticket.emergency',
        'ticket.overdue',
        'geofence.exit',
        'material.low',
      ]);
    });
  });

  describe('ticket.emergency (e2e-сценарий М3.3 на мок-Firebase)', () => {
    it('событие ticket.emergency → push залогирован + in-app записи созданы', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('ticket.emergency', {
          ticketId: 't-1',
          type: 'Затопление',
          objectName: 'БЦ «Северный»',
          floor: '3 этаж',
          lat: 55.75,
          lng: 37.61,
        }),
      );

      // Контракт 3.2 не содержит списка получателей → уведомляем владельцев активных устройств.
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        distinct: ['userId'],
        select: { userId: true },
      });

      // 1) push «отправлен» обоим получателям и залогирован мок-адаптером.
      expect(push.sent).toHaveLength(2);
      expect(push.sent[0]).toMatchObject({
        userId: 'u-1',
        template: 'EMERGENCY',
        title: '🚨 АВАРИЙНАЯ СИТУАЦИЯ',
        body: 'Затопление на объекте БЦ «Северный», 3 этаж',
        priority: 'high',
        tokens: [VALID_TOKEN],
      });
      expect(push.sent[0].data).toEqual({
        ticketId: 't-1',
        objectName: 'БЦ «Северный»',
        floor: '3 этаж',
        lat: '55.75',
        lng: '37.61',
      });
      expect(
        log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('[MOCK PUSH]')),
      ).toHaveLength(2);

      // 2) in-app записи сохранены для каждого получателя.
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u-1',
        type: 'EMERGENCY',
        title: '🚨 АВАРИЙНАЯ СИТУАЦИЯ',
        body: 'Затопление на объекте БЦ «Северный», 3 этаж',
      });
      expect(prisma.notification.create.mock.calls[1][0].data).toMatchObject({ userId: 'u-2' });
    });

    it('явные получатели в payload отменяют broadcast', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('ticket.emergency', {
          ticketId: 't-2',
          type: 'Затопление',
          objectName: 'Офис',
          floor: '1',
          userIds: ['u-7'],
        }),
      );

      // Broadcast-выборка (без select.token) не выполнялась.
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId: 'u-7', isActive: true },
        select: { token: true },
      });
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].userId).toBe('u-7');
    });
  });

  describe('остальные события', () => {
    it('ticket.created уведомляет назначенного исполнителя', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('ticket.created', {
          ticketId: 't-3',
          assigneeId: 'u-5',
          description: 'Помыть 3 этаж',
        }),
      );

      expect(push.sent).toHaveLength(1);
      expect(push.sent[0]).toMatchObject({ userId: 'u-5', template: 'NEW_TICKET' });
      expect(push.sent[0].body).toBe('Вам назначена задача: Помыть 3 этаж');
    });

    it('ticket.overdue без получателя в payload уходит владельцам устройств', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(message('ticket.overdue', { ticketId: 't-4', minutesOverdue: 42 }));

      expect(push.sent).toHaveLength(2);
      expect(push.sent[0].template).toBe('TICKET_OVERDUE');
      expect(push.sent[0].body).toBe('Заявка t-4 просрочена на 42 минут');
    });

    it('geofence.exit уведомляет сотрудника, покинувшего объект', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('geofence.exit', {
          userId: 'u-9',
          employeeName: 'Иванов И.',
          objectId: 'o-1',
          timestamp: '2026-01-01T10:00:00.000Z',
        }),
      );

      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].body).toBe('Иванов И. покинул территорию объекта');
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('material.low уведомляет ответственных из payload', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('material.low', {
          materialId: 'm-1',
          materialName: 'Мыло',
          objectId: 'o-1',
          objectName: 'Офис',
          quantity: 0.5,
          userIds: ['u-3'],
          assigneeId: 'u-4',
        }),
      );

      expect(push.sent.map((sent) => sent.userId)).toEqual(['u-3', 'u-4']);
      expect(push.sent[0].body).toBe('Мыло на объекте Офис ниже порога');
    });
  });

  describe('фильтрация и ошибки', () => {
    it('отключённый тип не создаёт ни push, ни in-app запись', async () => {
      const { prisma, push, consumer } = build();
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'u-5',
        disabledTypes: ['NEW_TICKET'],
      });

      await consumer.handle(
        message('ticket.created', { ticketId: 't-6', assigneeId: 'u-5', description: 'x' }),
      );

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(log.mock.calls.map((call) => String(call[0])).join('\n')).toContain('уведомлено 0 из 1');
    });

    it('неподдержанное событие не роняет консьюмер', async () => {
      const { prisma, push, consumer } = build();

      await expect(
        consumer.handle(message('schedule.missed_checkin', { userId: 'u-1', scheduleId: 's-1' })),
      ).resolves.toBeUndefined();

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('не преобразуется в уведомление'));
    });

    it('событие с нарушенным контрактом пропускается с предупреждением', async () => {
      const { push, consumer } = build();

      await expect(consumer.handle(message('ticket.created', { ticketId: 't-7' }))).resolves
        .toBeUndefined();

      expect(push.sent).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
    });

    it('при отсутствии получателей ничего не отправляется', async () => {
      const { prisma, push, consumer } = build();
      prisma.device.findMany.mockResolvedValue([]);

      await consumer.handle(message('ticket.overdue', { ticketId: 't-8', minutesOverdue: 5 }));

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('получателей нет'));
    });

    it('невалидный токен деактивирует устройство', async () => {
      const { prisma, push, consumer } = build();
      prisma.device.findMany.mockResolvedValue([{ token: 'bad-token' }]);

      await consumer.handle(
        message('geofence.exit', { userId: 'u-9', employeeName: 'Иванов' }),
      );

      expect(push.sent).toHaveLength(1);
      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { token: { in: ['bad-token'] } },
        data: { isActive: false },
      });
      // in-app запись сохраняется даже при мёртвом токене.
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });

    it('ошибка обработки проваливается наружу — RabbitmqService сделает nack', async () => {
      const { prisma, consumer } = build();
      prisma.notification.create.mockRejectedValue(new Error('БД недоступна'));

      await expect(
        consumer.handle(message('geofence.exit', { userId: 'u-9' })),
      ).rejects.toThrow('БД недоступна');
    });
  });
});
