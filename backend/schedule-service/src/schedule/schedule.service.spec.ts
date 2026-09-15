import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleEventStatus } from '@prisma/client';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { CoreClient } from '../core/core.client';
import {
  ExternalServiceUnavailableException,
  geofenceUnavailable,
} from '../common/external-service.exception';
import { EventsPublisher } from '../events/events.publisher';
import { GpsClient } from '../gps/gps.client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketClient, TicketCreationError } from '../tickets/ticket.client';
import {
  AUTO_CHECKOUT_REASON,
  OUTSIDE_GEOFENCE_MESSAGE,
  ScheduleService,
} from './schedule.service';

const NOW = new Date('2026-09-16T09:00:00.000Z');
const TODAY = new Date('2026-09-16T00:00:00.000Z');
const USER = 'user-1';
const SCHEDULE_ID = 'schedule-1';
const OBJECT_ID = 'object-1';

const RECURRENCE = { frequency: 'daily', time: '08:00' };

function scheduleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    objectId: OBJECT_ID,
    routeId: null,
    name: 'Ежедневная уборка',
    recurrence: RECURRENCE,
    assignees: [USER],
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function eventFixture(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'event-1',
    scheduleId: SCHEDULE_ID,
    date: TODAY,
    plannedStart: new Date('2026-09-16T08:00:00.000Z'),
    status: ScheduleEventStatus.PLANNED,
    userId: USER,
    checkInAt: null,
    checkOutAt: null,
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    ticketId: null,
    checkOutReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    schedule: scheduleFixture(),
  };
  const merged = { ...base, ...overrides };
  if (!('schedule' in overrides) || overrides.schedule === undefined) {
    merged.schedule = scheduleFixture();
  }
  return merged;
}

interface PrismaMock {
  schedule: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  scheduleEvent: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
}

function build(configValues: Record<string, unknown> = {}) {
  const prisma: PrismaMock = {
    schedule: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    scheduleEvent: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  const values: Record<string, unknown> = {
    'schedule.autoCheckoutMinutes': 15,
    'schedule.batchSize': 200,
    'schedule.generateHourUtc': 0,
    ...configValues,
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  const tickets = {
    createTicket: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    isAvailable: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<TicketClient>;

  const gps = {
    checkGeofence: jest
      .fn()
      .mockResolvedValue({ inside: true, distanceMeters: 12, geofence: { id: 'gf-1', objectId: OBJECT_ID, name: 'Офис', radiusMeters: 100 } }),
  } as unknown as jest.Mocked<GpsClient>;

  const core = {
    getObjectName: jest.fn().mockResolvedValue('БЦ Ромашка'),
  } as unknown as jest.Mocked<CoreClient>;

  const publisher = {
    publish: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<EventsPublisher>;

  const service = new ScheduleService(
    prisma as unknown as PrismaService,
    tickets,
    gps,
    core,
    publisher,
    config,
  );

  return { service, prisma, tickets, gps, core, publisher, config };
}

describe('ScheduleService (М4.4–М4.5)', () => {
  describe('CRUD графиков', () => {
    it('create нормализует правило и сохраняет уникальных исполнителей', async () => {
      const { service, prisma } = build();
      prisma.schedule.create.mockResolvedValue(scheduleFixture());

      const result = await service.create({
        name: 'Ежедневная уборка',
        objectId: OBJECT_ID,
        recurrence: { frequency: 'daily', time: '08:00' },
        assignees: [USER, USER, ' user-2 '],
        isActive: true,
      });

      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: {
          objectId: OBJECT_ID,
          routeId: null,
          name: 'Ежедневная уборка',
          recurrence: { frequency: 'daily', days: undefined, dayOfMonth: undefined, time: '08:00' },
          assignees: [USER, 'user-2'],
          isActive: true,
        },
      });
      expect(result.id).toBe(SCHEDULE_ID);
    });

    it('create требует days для weekly и dayOfMonth для monthly', async () => {
      const { service } = build();

      await expect(
        service.create({
          name: 'Пн-Пт',
          recurrence: { frequency: 'weekly', time: '08:00' },
          assignees: [USER],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.create({ name: 'Месяц', recurrence: { frequency: 'monthly', time: '08:00' }, assignees: [USER] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('list отдаёт графики с числом смен', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([
        { ...scheduleFixture(), _count: { events: 3 } },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0].eventsCount).toBe(3);
    });

    it('getById бросает 404, если графика нет', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update меняет только переданные поля', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      prisma.schedule.update.mockResolvedValue(scheduleFixture({ name: 'Новое имя' }));

      await service.update(SCHEDULE_ID, { name: 'Новое имя' });

      expect(prisma.schedule.update).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID },
        data: { name: 'Новое имя' },
      });
    });

    it('update сохраняет правило и исполнителей, когда они переданы', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      prisma.schedule.update.mockResolvedValue(scheduleFixture());

      await service.update(SCHEDULE_ID, {
        isActive: false,
        objectId: 'object-2',
        routeId: 'route-1',
        assignees: ['user-3'],
        recurrence: { frequency: 'weekly', days: [1, 3], time: '07:30' },
      });

      expect(prisma.schedule.update).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID },
        data: {
          isActive: false,
          objectId: 'object-2',
          routeId: 'route-1',
          assignees: ['user-3'],
          recurrence: { frequency: 'weekly', days: [1, 3], dayOfMonth: undefined, time: '07:30' },
        },
      });
    });

    it('remove удаляет график и сообщает число смен', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      prisma.scheduleEvent.count.mockResolvedValue(4);

      const result = await service.remove(SCHEDULE_ID);

      expect(result).toEqual({ id: SCHEDULE_ID, deleted: true, eventsDeleted: 4 });
      expect(prisma.schedule.delete).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } });
    });
  });

  describe('generateForDate (М4.4)', () => {
    it('создаёт смену и плановую заявку в ticket-service', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.schedulesMatched).toBe(1);
      expect(result.shiftsCreated).toBe(1);
      expect(result.ticketsCreated).toBe(1);
      expect(prisma.scheduleEvent.create).toHaveBeenCalledWith({
        data: {
          scheduleId: SCHEDULE_ID,
          date: new Date('2026-09-16T00:00:00.000Z'),
          plannedStart: new Date('2026-09-16T08:00:00.000Z'),
          status: ScheduleEventStatus.PLANNED,
          userId: USER,
        },
      });
      expect(tickets.createTicket).toHaveBeenCalledWith({
        type: 'planned',
        priority: 'normal',
        objectId: OBJECT_ID,
        assigneeId: USER,
        description: 'Плановая уборка по графику «Ежедневная уборка» на 2026-09-16 08:00 UTC',
      });
      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { ticketId: 'ticket-1' },
      });
    });

    it('создаёт по смене на каждого исполнителя', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([
        scheduleFixture({ assignees: ['user-1', 'user-2'] }),
      ]);
      prisma.scheduleEvent.create
        .mockResolvedValueOnce(eventFixture())
        .mockResolvedValueOnce(eventFixture({ id: 'event-2', userId: 'user-2' }));

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(2);
      expect(result.ticketsCreated).toBe(2);
    });

    it('идемпотентность: повторная генерация не создаёт дублей', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      // Смена уже есть и заявка привязана.
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture({ ticketId: 'ticket-1' }));

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(0);
      expect(result.shiftsSkipped).toBe(1);
      expect(prisma.scheduleEvent.create).not.toHaveBeenCalled();
      expect(tickets.createTicket).not.toHaveBeenCalled();
    });

    it('до-создаёт заявку, если прошлый проход не смог (backfill)', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture({ ticketId: null }));

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(0);
      expect(result.ticketsBackfilled).toBe(1);
      expect(tickets.createTicket).toHaveBeenCalledTimes(1);
    });

    it('weekly Пн–Пт: в воскресенье смен нет, в среду есть', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([
        scheduleFixture({ recurrence: { frequency: 'weekly', days: [1, 2, 3, 4, 5], time: '08:00' } }),
      ]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      const sunday = await service.generateForDate('2026-09-20', NOW);
      expect(sunday.schedulesMatched).toBe(0);
      expect(sunday.shiftsCreated).toBe(0);

      const wednesday = await service.generateForDate('2026-09-16', NOW);
      expect(wednesday.schedulesMatched).toBe(1);
      expect(wednesday.shiftsCreated).toBe(1);
    });

    it('monthly попадает только на своё число месяца', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([
        scheduleFixture({ recurrence: { frequency: 'monthly', dayOfMonth: 1, time: '10:00' } }),
      ]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      expect((await service.generateForDate('2026-09-01', NOW)).shiftsCreated).toBe(1);
      expect((await service.generateForDate('2026-09-02', NOW)).shiftsCreated).toBe(0);
    });

    it('битое правило повторения не роняет проход и попадает в errors', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture({ recurrence: { time: '08:00' } })]);

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.schedulesMatched).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('недоступный ticket-service → 502, смены не создаются', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      tickets.isAvailable.mockResolvedValue(false);

      await expect(service.generateForDate('2026-09-16', NOW)).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining('ticket-service недоступен'),
      });
      expect(prisma.scheduleEvent.create).not.toHaveBeenCalled();
    });

    it('сбой заявки по одной смене не прерывает остальные и попадает в errors', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([
        scheduleFixture({ assignees: ['user-1', 'user-2'] }),
      ]);
      prisma.scheduleEvent.create
        .mockResolvedValueOnce(eventFixture())
        .mockResolvedValueOnce(eventFixture({ id: 'event-2', userId: 'user-2' }));
      tickets.createTicket
        .mockRejectedValueOnce(new TicketCreationError('ticket-service недоступен', true))
        .mockResolvedValueOnce({ id: 'ticket-2' });

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(2);
      expect(result.ticketsCreated).toBe(1);
      expect(result.ticketsFailed).toBe(1);
      expect(result.errors[0]).toContain('Смена event-1');
    });

    it('график без объекта: смена создаётся, заявка — нет', async () => {
      const { service, prisma, tickets } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture({ objectId: null })]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(1);
      expect(result.ticketsCreated).toBe(0);
      expect(tickets.createTicket).not.toHaveBeenCalled();
    });

    it('график без исполнителей создаёт одну смену без userId', async () => {
      const { service, prisma } = build();
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture({ assignees: [] })]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture({ userId: null }));

      const result = await service.generateForDate('2026-09-16', NOW);

      expect(result.shiftsCreated).toBe(1);
      expect(prisma.scheduleEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: null }),
      });
    });

    it('дата по умолчанию — сегодня UTC', async () => {
      const { service, prisma } = build();

      const result = await service.generateForDate(undefined, NOW);

      expect(result.date).toBe('2026-09-16');
      expect(prisma.schedule.findMany).toHaveBeenCalled();
    });

    it('некорректная дата → 400', async () => {
      const { service } = build();
      await expect(service.generateForDate('16-09-2026', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('generateForCurrentHour (cron)', () => {
    it('в чужой час проход не выполняется', async () => {
      const { service, prisma } = build({ 'schedule.generateHourUtc': 8 });

      const skipped = await service.generateForCurrentHour(NOW);

      expect(skipped).toBeNull();
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('в нужный час генерирует смены на сегодня', async () => {
      const { service, prisma } = build({ 'schedule.generateHourUtc': 9 });
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      const result = await service.generateForCurrentHour(NOW);

      expect(result?.date).toBe('2026-09-16');
      expect(result?.shiftsCreated).toBe(1);
    });

    it('ошибка прохода не пробрасывается в таймер', async () => {
      const { service, prisma } = build({ 'schedule.generateHourUtc': 9 });
      prisma.schedule.findMany.mockRejectedValue(new Error('БД недоступна'));

      await expect(service.generateForCurrentHour(NOW)).resolves.toBeNull();
    });
  });

  describe('check-in (М4.5)', () => {
    it('внутри геозоны переводит смену в CHECKED_IN с координатами', async () => {
      const { service, prisma, gps } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());
      prisma.scheduleEvent.update.mockResolvedValue(
        eventFixture({
          status: ScheduleEventStatus.CHECKED_IN,
          checkInAt: NOW,
          checkInLat: 55.75,
          checkInLng: 37.61,
        }),
      );

      const result = await service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 55.75, lng: 37.61 }, 'user-token', NOW);

      expect(gps.checkGeofence).toHaveBeenCalledWith(USER, 55.75, 37.61, 'user-token');
      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: {
          status: ScheduleEventStatus.CHECKED_IN,
          checkInAt: NOW,
          checkInLat: 55.75,
          checkInLng: 37.61,
        },
        include: { schedule: true },
      });
      expect(result.status).toBe(ScheduleEventStatus.CHECKED_IN);
      expect(result.checkInAt).toBe(NOW.toISOString());
    });

    it('вне зоны → 403 с текстом «Вы находитесь вне зоны объекта»', async () => {
      const { service, prisma, gps } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());
      gps.checkGeofence.mockResolvedValue({ inside: false, distanceMeters: 900, geofence: null });

      await expect(
        service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 55.0, lng: 37.0 }, undefined, NOW),
      ).rejects.toMatchObject({ message: OUTSIDE_GEOFENCE_MESSAGE, status: 403 });
      expect(prisma.scheduleEvent.update).not.toHaveBeenCalled();
    });

    it('идемпотентность: повторный check-in не ходит в gps', async () => {
      const { service, prisma, gps } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_IN, checkInAt: NOW }),
      );

      const result = await service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 55.75, lng: 37.61 }, undefined, NOW);

      expect(gps.checkGeofence).not.toHaveBeenCalled();
      expect(prisma.scheduleEvent.update).not.toHaveBeenCalled();
      expect(result.status).toBe(ScheduleEventStatus.CHECKED_IN);
    });

    it('закрытая смена → 409', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_OUT, checkOutAt: NOW }),
      );

      await expect(
        service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 }, undefined, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('нет смены на сегодня → 404 с названием графика', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(null);
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());

      await expect(
        service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 }, undefined, NOW),
      ).rejects.toThrow(/Ежедневная уборка/);
    });

    it('нет ни смены, ни графика → 404 «График не найден»', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(null);
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expect(
        service.checkIn(USER, { scheduleId: 'nope', lat: 1, lng: 1 }, undefined, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('недоступный gps-service → 502, а не 500', async () => {
      const { service, prisma, gps } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());
      gps.checkGeofence.mockRejectedValue(geofenceUnavailable());

      await expect(
        service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 }, undefined, NOW),
      ).rejects.toMatchObject({
        status: 502,
        message: 'Не удалось подтвердить геозону: сервис геозон недоступен, check-in не выполнен',
      });
    });

    it('неожиданная ошибка gps тоже превращается в 502, а не в 500', async () => {
      const { service, prisma, gps } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());
      gps.checkGeofence.mockRejectedValue(new Error('странная ошибка'));

      await expect(
        service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 }, undefined, NOW),
      ).rejects.toBeInstanceOf(ExternalServiceUnavailableException);
    });
  });

  describe('check-out (М4.5)', () => {
    it('закрывает открытую смену с координатами', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_IN, checkInAt: new Date('2026-09-16T08:05:00.000Z') }),
      );
      prisma.scheduleEvent.update.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_OUT, checkOutAt: NOW }),
      );

      const result = await service.checkOut(USER, { scheduleId: SCHEDULE_ID, lat: 55.75, lng: 37.61 }, NOW);

      expect(result.status).toBe(ScheduleEventStatus.CHECKED_OUT);
      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: {
          status: ScheduleEventStatus.CHECKED_OUT,
          checkOutAt: NOW,
          checkOutLat: 55.75,
          checkOutLng: 37.61,
        },
        include: { schedule: true },
      });
    });

    it('координаты необязательны', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_IN, checkInAt: NOW }),
      );
      prisma.scheduleEvent.update.mockResolvedValue(eventFixture({ status: ScheduleEventStatus.CHECKED_OUT }));

      await service.checkOut(USER, { scheduleId: SCHEDULE_ID }, NOW);

      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ checkOutLat: null, checkOutLng: null }) }),
      );
    });

    it('идемпотентность: повторный check-out не перезаписывает время', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(
        eventFixture({ status: ScheduleEventStatus.CHECKED_OUT, checkOutAt: NOW, checkInAt: NOW }),
      );

      const result = await service.checkOut(USER, { scheduleId: SCHEDULE_ID }, NOW);

      expect(prisma.scheduleEvent.update).not.toHaveBeenCalled();
      expect(result.status).toBe(ScheduleEventStatus.CHECKED_OUT);
    });

    it('без check-in → 400', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());

      await expect(service.checkOut(USER, { scheduleId: SCHEDULE_ID }, NOW)).rejects.toThrow(
        'Смена не открыта: сначала выполните check-in',
      );
    });
  });

  describe('checkMissed (М4.5)', () => {
    it('неявка → MISSED и событие schedule.missed_checkin', async () => {
      const { service, prisma, publisher, core } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([eventFixture()]);
      prisma.scheduleEvent.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.checkMissed('2026-09-16', NOW);

      expect(result.missed).toBe(1);
      expect(result.eventIds).toEqual(['event-1']);
      expect(prisma.scheduleEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'event-1', status: ScheduleEventStatus.PLANNED, checkInAt: null },
        data: { status: ScheduleEventStatus.MISSED },
      });
      expect(core.getObjectName).toHaveBeenCalledWith(OBJECT_ID);
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
        userId: USER,
        scheduleId: SCHEDULE_ID,
        objectName: 'БЦ Ромашка',
        eventId: 'event-1',
        objectId: OBJECT_ID,
        plannedStart: '2026-09-16T08:00:00.000Z',
        detectedAt: NOW.toISOString(),
      });
    });

    it('без даты проверяет все дни', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([]);

      await service.checkMissed(undefined, NOW);

      const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
      expect(where.date).toBeUndefined();
      expect(where.status).toBe(ScheduleEventStatus.PLANNED);
      expect(where.checkInAt).toBeNull();
      expect(where.userId).toEqual({ not: null });
    });

    it('если имя объекта не получено — подставляется objectId', async () => {
      const { service, prisma, core, publisher } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([eventFixture()]);
      core.getObjectName.mockResolvedValue(null);

      await service.checkMissed(undefined, NOW);

      expect(publisher.publish).toHaveBeenCalledWith(
        ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN,
        expect.objectContaining({ objectName: OBJECT_ID }),
      );
    });

    it('смена без объекта публикует пустое имя и не ходит в core', async () => {
      const { service, prisma, core, publisher } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([
        eventFixture({ schedule: scheduleFixture({ objectId: null }) }),
      ]);

      await service.checkMissed(undefined, NOW);

      expect(core.getObjectName).not.toHaveBeenCalled();
      expect(publisher.publish).toHaveBeenCalledWith(
        ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN,
        expect.objectContaining({ objectName: '', objectId: '' }),
      );
    });

    it('гонка: смену успели отметить — событие не публикуется', async () => {
      const { service, prisma, publisher } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([eventFixture()]);
      prisma.scheduleEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.checkMissed(undefined, NOW);

      expect(result.missed).toBe(0);
      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('autoCheckout (М4.5)', () => {
    it('закрывает смену CHECKED_IN после таймаута с пометкой причины', async () => {
      const { service, prisma } = build({ 'schedule.autoCheckoutMinutes': 15 });
      prisma.scheduleEvent.findMany.mockResolvedValue([
        eventFixture({ status: ScheduleEventStatus.CHECKED_IN, checkInAt: new Date('2026-09-16T08:01:00.000Z') }),
      ]);

      const result = await service.autoCheckout(NOW);

      expect(result).toEqual({ closed: 1, eventIds: ['event-1'] });
      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: {
          status: ScheduleEventStatus.CHECKED_OUT,
          checkOutAt: NOW,
          checkOutReason: AUTO_CHECKOUT_REASON,
        },
      });
    });

    it('порог считается от plannedStart с настраиваемым окном', async () => {
      const { service, prisma } = build({ 'schedule.autoCheckoutMinutes': 30 });

      await service.autoCheckout(NOW);

      const arg = prisma.scheduleEvent.findMany.mock.calls[0][0];
      expect(arg.where.plannedStart.lte.toISOString()).toBe('2026-09-16T08:30:00.000Z');
      expect(arg.where.status).toBe(ScheduleEventStatus.CHECKED_IN);
      expect(arg.where.checkOutAt).toBeNull();
    });

    it('если зависших смен нет — ничего не закрывается', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([]);

      expect(await service.autoCheckout(NOW)).toEqual({ closed: 0, eventIds: [] });
      expect(prisma.scheduleEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('scanMissedAndAutoCheckout (cron-проход)', () => {
    it('сначала закрывает зависшие смены, затем фиксирует неявки', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findMany
        .mockResolvedValueOnce([eventFixture({ id: 'hung', status: ScheduleEventStatus.CHECKED_IN, checkInAt: NOW })])
        .mockResolvedValueOnce([eventFixture({ id: 'missed' })]);

      const result = await service.scanMissedAndAutoCheckout('2026-09-16', NOW);

      expect(result.autoCheckout.eventIds).toEqual(['hung']);
      expect(result.missed.eventIds).toEqual(['missed']);
    });
  });

  describe('ограничение ручных проходов одним графиком/сменой (задача A2)', () => {
    it('generateForDate по scheduleId фильтрует графики', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      prisma.schedule.findMany.mockResolvedValue([scheduleFixture()]);
      prisma.scheduleEvent.create.mockResolvedValue(eventFixture());

      const result = await service.generateForDate('2026-09-16', NOW, { scheduleId: SCHEDULE_ID });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: { isActive: true, id: SCHEDULE_ID },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.schedulesMatched).toBe(1);
      expect(result.shiftsCreated).toBe(1);
      expect(result.ticketsCreated).toBe(1);
    });

    it('generateForDate с неизвестным scheduleId → 404, генерации нет', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expect(
        service.generateForDate('2026-09-16', NOW, { scheduleId: 'nope' }),
      ).rejects.toMatchObject({ status: 404, message: 'График не найден' });
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
      expect(prisma.scheduleEvent.create).not.toHaveBeenCalled();
    });

    it('generateForDate без scheduleId работает по всем активным графикам', async () => {
      const { service, prisma } = build();

      await service.generateForDate('2026-09-16', NOW);

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      // Область не задана — лишнего запроса «существует ли график» нет.
      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
    });

    it('checkMissed по scheduleId ограничивает выборку сменами графика', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());

      await service.checkMissed('2026-09-16', NOW, { scheduleId: SCHEDULE_ID });

      const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
      expect(where.scheduleId).toBe(SCHEDULE_ID);
      expect(where.id).toBeUndefined();
      // Дата продолжает действовать: ограничение графика её не отменяет.
      expect(where.date).toEqual(new Date('2026-09-16T00:00:00.000Z'));
    });

    it('checkMissed по eventId обрабатывает ровно одну смену и игнорирует дату', async () => {
      const { service, prisma, publisher } = build();
      prisma.scheduleEvent.findUnique.mockResolvedValue(eventFixture());
      prisma.scheduleEvent.findMany.mockResolvedValue([eventFixture()]);

      const result = await service.checkMissed('2026-01-01', NOW, { eventId: 'event-1' });

      const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
      expect(where.id).toBe('event-1');
      expect(where.scheduleId).toBeUndefined();
      expect(where.date).toBeUndefined();
      expect(result).toEqual({ scanned: 1, missed: 1, eventIds: ['event-1'] });
      expect(prisma.scheduleEvent.updateMany).toHaveBeenCalledTimes(1);
      expect(publisher.publish).toHaveBeenCalledTimes(1);
    });

    it('autoCheckout ограничивается графиком или сменой', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());

      await service.autoCheckout(NOW, { scheduleId: SCHEDULE_ID });
      expect(prisma.scheduleEvent.findMany.mock.calls[0][0].where).toMatchObject({
        scheduleId: SCHEDULE_ID,
        status: ScheduleEventStatus.CHECKED_IN,
      });

      prisma.scheduleEvent.findUnique.mockResolvedValue(eventFixture());
      await service.autoCheckout(NOW, { eventId: 'event-1' });
      expect(prisma.scheduleEvent.findMany.mock.calls[1][0].where).toMatchObject({
        id: 'event-1',
        status: ScheduleEventStatus.CHECKED_IN,
      });
    });

    it('scanMissedAndAutoCheckout прокидывает область в оба прохода и проверяет id один раз', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      prisma.scheduleEvent.findMany
        .mockResolvedValueOnce([eventFixture({ id: 'hung', status: ScheduleEventStatus.CHECKED_IN, checkInAt: NOW })])
        .mockResolvedValueOnce([eventFixture({ id: 'missed' })]);

      const result = await service.scanMissedAndAutoCheckout('2026-09-16', NOW, {
        scheduleId: SCHEDULE_ID,
      });

      expect(result.autoCheckout.eventIds).toEqual(['hung']);
      expect(result.missed.eventIds).toEqual(['missed']);
      expect(prisma.schedule.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.scheduleEvent.findMany.mock.calls[0][0].where.scheduleId).toBe(SCHEDULE_ID);
      expect(prisma.scheduleEvent.findMany.mock.calls[1][0].where.scheduleId).toBe(SCHEDULE_ID);
    });

    it('неизвестный eventId или scheduleId → 404 с русским текстом', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findUnique.mockResolvedValue(null);
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expect(service.checkMissed(undefined, NOW, { eventId: 'nope' })).rejects.toMatchObject({
        status: 404,
        message: 'Смена не найдена',
      });
      await expect(service.checkMissed(undefined, NOW, { scheduleId: 'nope' })).rejects.toMatchObject({
        status: 404,
        message: 'График не найден',
      });
      await expect(service.autoCheckout(NOW, { eventId: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.autoCheckout(NOW, { scheduleId: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.scanMissedAndAutoCheckout(undefined, NOW, { eventId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // 404 отдаётся до выборки смен: чужие данные в проход не попадают.
      expect(prisma.scheduleEvent.findMany).not.toHaveBeenCalled();
    });

    it('при обоих id приоритет у eventId: scheduleId не проверяется', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findUnique.mockResolvedValue(eventFixture());
      prisma.scheduleEvent.findMany.mockResolvedValue([]);

      await service.scanMissedAndAutoCheckout(undefined, NOW, {
        scheduleId: 'nope',
        eventId: 'event-1',
      });

      expect(prisma.scheduleEvent.findUnique).toHaveBeenCalledWith({ where: { id: 'event-1' } });
      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
      expect(prisma.scheduleEvent.findMany.mock.calls[0][0].where.id).toBe('event-1');
    });

    it('без параметров проходы не фильтруются по графику и смене', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([]);

      await service.checkMissed(undefined, NOW);
      await service.autoCheckout(NOW);
      await service.generateForDate('2026-09-16', NOW);

      expect(prisma.scheduleEvent.findMany.mock.calls.length).toBeGreaterThan(0);
      for (const call of prisma.scheduleEvent.findMany.mock.calls) {
        expect(call[0].where.id).toBeUndefined();
        expect(call[0].where.scheduleId).toBeUndefined();
      }
      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
      expect(prisma.scheduleEvent.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('выборки смен', () => {
    it('listEvents фильтрует по дню, объекту и исполнителю', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findMany.mockResolvedValue([eventFixture()]);

      const result = await service.listEvents({
        date: '2026-09-16',
        objectId: OBJECT_ID,
        userId: USER,
      });

      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith({
        where: {
          date: new Date('2026-09-16T00:00:00.000Z'),
          schedule: { objectId: OBJECT_ID },
          userId: USER,
        },
        include: { schedule: true },
        orderBy: [{ plannedStart: 'asc' }],
      });
      expect(result[0]).toMatchObject({
        id: 'event-1',
        scheduleName: 'Ежедневная уборка',
        objectId: OBJECT_ID,
        date: '2026-09-16',
        plannedStart: '2026-09-16T08:00:00.000Z',
        checkInAt: null,
        checkOutAt: null,
        ticketId: null,
      });
    });

    it('listEvents без даты берёт сегодня UTC', async () => {
      const { service, prisma } = build();

      await service.listEvents({});

      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { date: expect.any(Date) } }),
      );
    });

    it('listEvents с битой датой → 400', async () => {
      const { service } = build();
      await expect(service.listEvents({ date: 'вчера' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('listMyEvents по умолчанию — сегодняшний день', async () => {
      const { service, prisma } = build();

      await service.listMyEvents(USER, {});

      const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(USER);
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.lt).toBeUndefined();
    });

    it('listMyEvents с периодом включает последний день целиком', async () => {
      const { service, prisma } = build();

      await service.listMyEvents(USER, { from: '2026-09-01', to: '2026-09-30' });

      const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
      expect(where.date.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(where.date.lt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('getEvent по id отдаёт смену, а на отсутствующую — 404', async () => {
      const { service, prisma } = build();
      prisma.scheduleEvent.findUnique.mockResolvedValue(eventFixture());

      expect((await service.getEvent('event-1')).id).toBe('event-1');

      prisma.scheduleEvent.findUnique.mockResolvedValue(null);
      await expect(service.getEvent('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('viewOf достраивает график, если include его не вернул', async () => {
      const { service, prisma } = build();
      prisma.schedule.findUnique.mockResolvedValue(scheduleFixture());
      // Повторный check-in идёт через viewOf: событие без include(schedule).
      prisma.scheduleEvent.findFirst.mockResolvedValue({
        ...eventFixture({ status: ScheduleEventStatus.CHECKED_IN, checkInAt: NOW }),
        schedule: undefined,
      });

      const view = await service.checkIn(
        USER,
        { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 },
        undefined,
        NOW,
      );

      expect(view.scheduleName).toBe('Ежедневная уборка');
      expect(prisma.schedule.findUnique).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } });
    });
  });

  it('ForbiddenException используется именно для «вне зоны»', async () => {
    const { service, prisma, gps } = build();
    prisma.scheduleEvent.findFirst.mockResolvedValue(eventFixture());
    gps.checkGeofence.mockResolvedValue({ inside: false, distanceMeters: null, geofence: null });

    await expect(
      service.checkIn(USER, { scheduleId: SCHEDULE_ID, lat: 1, lng: 1 }, undefined, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
