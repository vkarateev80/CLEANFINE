import { Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { MockPushSender } from '../push/mock-push.sender';
import { NotificationConsumer } from './notification.consumer';
import type { WebPushSender } from '../push/web-push.sender';
import type { StaffDirectoryService } from '../../integration/staff-directory.service';
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

/**
 * Бригадиры/админы из справочника auth-service (служебная аудитория). По
 * умолчанию совпадает с владельцем устройства u-1, чтобы сценарии broadcast
 * ниже считали получателей как прежде; отдельный тест переопределяет список.
 */
const STAFF_USERS = ['u-1'];

function build(): {
  prisma: PrismaMock;
  push: MockPushSender;
  rabbit: { subscribe: jest.Mock };
  consumer: NotificationConsumer;
  staff: { staffIds: jest.Mock; userName: jest.Mock };
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
  const webPush = {
    enabled: false,
    publicKey: null,
    send: jest.fn().mockResolvedValue({ successCount: 0, failureCount: 0, invalidTokens: [] }),
  };
  const staff = {
    staffIds: jest.fn().mockResolvedValue(STAFF_USERS),
    userName: jest.fn().mockResolvedValue(null),
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    push,
    webPush as unknown as WebPushSender,
    staff as unknown as StaffDirectoryService,
  );
  const consumer = new NotificationConsumer(rabbit as unknown as RabbitmqService, service);

  return { prisma, push, rabbit, consumer, staff };
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
    it('подписывается на все очереди уведомлений из общего контракта', () => {
      const { rabbit, consumer } = build();

      consumer.onModuleInit();

      expect(rabbit.subscribe.mock.calls.map((call) => call[0])).toEqual([
        'notification.ticket.created',
        'notification.ticket.assigned',
        'notification.ticket.emergency',
        'notification.ticket.overdue',
        'notification.geofence.exit',
        'notification.material.low',
        'notification.schedule.missed_checkin',
        'notification.ticket.status_changed',
      ]);
      expect(rabbit.subscribe.mock.calls.map((call) => call[1])).toEqual([
        'ticket.created',
        'ticket.assigned',
        'ticket.emergency',
        'ticket.overdue',
        'geofence.exit',
        'material.low',
        'schedule.missed_checkin',
        'ticket.status_changed',
      ]);
      // Очередь material.ticket.operation.completed обрабатывает material-service.
      expect(rabbit.subscribe.mock.calls.map((call) => call[0])).not.toContain(
        'material.ticket.operation.completed',
      );
    });
  });

  describe('ticket.emergency (e2e-сценарий М3.3 на мок-push)', () => {
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
        log.mock.calls
          .map((call) => String(call[0]))
          .filter((line) => line.includes('[MOCK PUSH]')),
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
        select: { token: true, platform: true },
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

    it('плановая задача смены (ticket.created с окном) — in-app без push, ночью телефон молчит', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('ticket.created', {
          ticketId: 't-9',
          assigneeId: 'u-5',
          description: 'Плановая уборка по графику «Уборка1» на 2026-10-22 18:00 МСК',
          plannedStart: '2026-10-22T15:00:00.000Z',
          plannedEnd: '2026-10-22T23:00:00.000Z',
        }),
      );

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u-5',
        type: 'NEW_TICKET',
      });
    });

    it('ticket.assigned при создании (onCreate) пропускается: уведомление уже ушло по ticket.created', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(
        message('ticket.assigned', { ticketId: 't-9', assigneeId: 'u-5', onCreate: true }),
      );

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
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

  describe('schedule.missed_checkin (неявка на смену)', () => {
    const event = {
      eventId: 'e-1',
      scheduleId: 's-1',
      userId: 'u-8',
      objectId: 'o-5',
      objectName: 'БЦ «Северный»',
      plannedStart: '2026-02-01T08:00:00.000Z',
      detectedAt: '2026-02-01T08:20:00.000Z',
    };

    it('событие schedule.missed_checkin → push залогирован + in-app запись сотруднику', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(message('schedule.missed_checkin', event));

      // 1) push «отправлен» ровно адресату из payload и залогирован мок-адаптером.
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0]).toMatchObject({
        userId: 'u-8',
        template: 'SCHEDULE_MISSED',
        title: '⚠️ Неявка на смену',
        body: 'Неявка на смену: БЦ «Северный», плановое начало 01.02.2026 08:00 UTC',
        priority: 'high',
        tokens: [VALID_TOKEN],
        data: {
          eventId: 'e-1',
          scheduleId: 's-1',
          userId: 'u-8',
          objectId: 'o-5',
          objectName: 'БЦ «Северный»',
          plannedStart: '2026-02-01T08:00:00.000Z',
          detectedAt: '2026-02-01T08:20:00.000Z',
        },
      });
      expect(
        log.mock.calls
          .map((call) => String(call[0]))
          .filter((line) => line.includes('[MOCK PUSH]')),
      ).toHaveLength(1);

      // 2) in-app запись создана именно указанному пользователю.
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u-8',
        type: 'SCHEDULE_MISSED',
        title: '⚠️ Неявка на смену',
        body: 'Неявка на смену: БЦ «Северный», плановое начало 01.02.2026 08:00 UTC',
        payload: event,
      });

      // 3) broadcast не сработал: уведомление адресное, а не «всем».
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId: 'u-8', isActive: true },
        select: { token: true, platform: true },
      });
      expect(prisma.device.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ distinct: ['userId'] }),
      );
    });

    it('пустой userId у события → broadcast по владельцам активных устройств', async () => {
      const { prisma, push, consumer } = build();
      devicesFindMany(prisma);

      await consumer.handle(message('schedule.missed_checkin', { ...event, userId: '' }));

      expect(push.sent.map((sent) => sent.userId)).toEqual(['u-1', 'u-2']);
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        distinct: ['userId'],
        select: { userId: true },
      });
    });
  });

  describe('служебная аудитория (09.10.2026)', () => {
    it('SOS без получателей доходит до админа без устройств — in-app запись', async () => {
      const { prisma, consumer, push, staff } = build();
      devicesFindMany(prisma);
      staff.staffIds.mockResolvedValue(['u-admin']);
      prisma.device.findMany.mockImplementation(
        (args: { where?: { userId?: string }; select?: { token?: boolean } }) => {
          if (args.select?.token === true) {
            return Promise.resolve(args.where?.userId === 'u-admin' ? [] : [{ token: VALID_TOKEN }]);
          }
          return Promise.resolve(BROADCAST_USERS.map((userId) => ({ userId })));
        },
      );

      await consumer.handle(
        message('ticket.emergency', { ticketId: 't-9', type: 'Протечка', objectName: 'БЦ' }),
      );

      const recipients = prisma.notification.create.mock.calls.map(
        (call: [{ data: { userId: string } }]) => call[0].data.userId,
      );
      expect(recipients.sort()).toEqual(['u-1', 'u-2', 'u-admin']);
      // push — только владельцам устройств; админ получил in-app.
      expect(push.sent.map((item) => item.userId).sort()).toEqual(['u-1', 'u-2']);
    });

    it('ticket.status_changed уходит админам и автору, но не инициатору', async () => {
      const { prisma, consumer, staff } = build();
      devicesFindMany(prisma);
      staff.staffIds.mockResolvedValue(['u-admin', 'u-op']);
      // Логин из JWT заменяется именем из справочника.
      staff.userName.mockResolvedValue('Оператор Иванов');

      await consumer.handle(
        message('ticket.status_changed', {
          ticketId: 't-1',
          status: 'in_progress',
          previousStatus: 'assigned',
          type: 'planned',
          description: 'Холл',
          objectId: 'obj-1',
          assigneeId: 'u-op',
          createdBy: 'u-client',
          actorId: 'u-op',
          actorName: 'Оператор',
          changedAt: '2026-10-09T12:00:00.000Z',
        }),
      );

      const created = prisma.notification.create.mock.calls.map(
        (call: [{ data: { userId: string; type: string; title: string } }]) => call[0].data,
      );
      expect(created.map((item) => item.userId).sort()).toEqual(['u-admin', 'u-client']);
      expect(created[0]).toMatchObject({
        type: 'TICKET_STATUS',
        title: '▶️ Заявка в работе',
        body: 'Холл (плановая) · Оператор Иванов',
      });
      expect(staff.userName).toHaveBeenCalledWith('u-op');
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
      expect(log.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
        'уведомлено 0 из 1',
      );
    });

    it('неподдержанное событие не роняет консьюмер', async () => {
      const { prisma, push, consumer } = build();

      await expect(
        consumer.handle(message('schedule.unknown', { userId: 'u-1', scheduleId: 's-1' })),
      ).resolves.toBeUndefined();

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('не преобразуется в уведомление'));
    });

    it('событие с нарушенным контрактом пропускается с предупреждением', async () => {
      const { push, consumer } = build();

      await expect(
        consumer.handle(message('ticket.created', { ticketId: 't-7' })),
      ).resolves.toBeUndefined();

      expect(push.sent).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
    });

    it('при отсутствии получателей ничего не отправляется', async () => {
      const { prisma, push, consumer, staff } = build();
      // Без устройств и без сотрудников в справочнике получателей действительно нет.
      staff.staffIds.mockResolvedValue([]);
      prisma.device.findMany.mockResolvedValue([]);

      await consumer.handle(message('ticket.overdue', { ticketId: 't-8', minutesOverdue: 5 }));

      expect(push.sent).toHaveLength(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('получателей нет'));
    });

    it('невалидный токен деактивирует устройство', async () => {
      const { prisma, push, consumer } = build();
      prisma.device.findMany.mockResolvedValue([{ token: 'bad-token' }]);

      await consumer.handle(message('geofence.exit', { userId: 'u-9', employeeName: 'Иванов' }));

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

      await expect(consumer.handle(message('geofence.exit', { userId: 'u-9' }))).rejects.toThrow(
        'БД недоступна',
      );
    });
  });
});
