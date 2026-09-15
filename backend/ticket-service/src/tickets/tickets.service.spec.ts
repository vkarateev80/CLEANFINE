import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Ticket } from '@prisma/client';
import { INVALID_TRANSITION_MESSAGE } from '@cleaning-ops/shared/types/tickets';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import type { AuthUser } from '../auth/guards/roles.guard';
import { EventsPublisher } from '../events/events.publisher';
import { GpsClient } from '../gps/gps.client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

const NOW = new Date('2026-01-01T10:00:00.000Z');

const USER: AuthUser = {
  id: 'u-admin',
  email: 'admin@cleaning-ops.com',
  role: 'ADMIN',
  fullName: 'Администратор',
};

/** Форма мока Prisma: только те методы, которые реально вызывает сервис. */
interface PrismaMock {
  ticket: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  ticketAssignment: { create: jest.Mock };
  ticketComment: { create: jest.Mock };
  ticketOperationCompletion: { create: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    ticket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    ticketAssignment: { create: jest.fn() },
    ticketComment: { create: jest.fn() },
    ticketOperationCompletion: { create: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  // Сервис использует и массив промисов ($transaction([...])), и интерактивную транзакцию.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma;
}

function createConfig(): ConfigService {
  const values: Record<string, number> = {
    'escalation.newToAcceptMin': 5,
    'escalation.acceptToArriveMin': 15,
    'escalation.arriveToDoneMin': 60,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function ticketFixture(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    type: 'planned',
    priority: 'normal',
    status: 'new',
    objectId: 'obj-1',
    roomId: null,
    assigneeId: null,
    createdBy: 'u-admin',
    description: 'Влажная уборка холла',
    lat: null,
    lng: null,
    assignedAt: null,
    acceptedAt: null,
    arrivedAt: null,
    completedAt: null,
    verifiedAt: null,
    closedAt: null,
    escalatedAt: null,
    overdueAt: null,
    reactionDeadline: new Date('2026-01-01T10:05:00.000Z'),
    arrivalDeadline: null,
    completionDeadline: null,
    operationsTotal: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('TicketsService (М3.4–М3.6)', () => {
  let prisma: PrismaMock;
  let publisher: { publish: jest.Mock };
  let gps: { findNearbyEmployees: jest.Mock };
  let service: TicketsService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = createPrismaMock();
    publisher = { publish: jest.fn().mockResolvedValue(true) };
    gps = { findNearbyEmployees: jest.fn().mockResolvedValue([]) };
    service = new TicketsService(
      prisma as unknown as PrismaService,
      publisher as unknown as EventsPublisher,
      gps as unknown as GpsClient,
      createConfig(),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ------------------------------------------------------------------ создание

  describe('create', () => {
    it('плановая заявка без исполнителя: статус new, дедлайн реакции 5 мин, ticket.created', async () => {
      const created = ticketFixture();
      prisma.ticket.create.mockResolvedValue(created);

      const result = await service.create(
        { type: 'planned', objectId: 'obj-1', description: 'Влажная уборка холла' },
        USER,
      );

      expect(result).toBe(created);
      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'planned',
          // Приоритет по умолчанию — normal (УСТАВ п.2).
          priority: 'normal',
          status: 'new',
          assigneeId: null,
          createdBy: 'u-admin',
          reactionDeadline: new Date('2026-01-01T10:05:00.000Z'),
        }),
      });
      // Контракт 3.2: ticketId, assigneeId, description (assigneeId пустой, если не назначен).
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_CREATED, {
        ticketId: 't-1',
        assigneeId: '',
        description: 'Влажная уборка холла',
      });
      expect(publisher.publish).toHaveBeenCalledTimes(1);
    });

    it('внеплановая заявка с приоритетом high и координатами', async () => {
      prisma.ticket.create.mockResolvedValue(ticketFixture({ type: 'unscheduled', priority: 'high' }));

      await service.create(
        {
          type: 'unscheduled',
          priority: 'high',
          objectId: 'obj-2',
          roomId: 'room-1',
          description: 'Разбито стекло',
          lat: 55.75,
          lng: 37.61,
        },
        USER,
      );

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'unscheduled',
          priority: 'high',
          roomId: 'room-1',
          lat: 55.75,
          lng: 37.61,
        }),
      });
    });

    it('создание сразу с исполнителем (schedule-service): assigned, дедлайн прибытия, история, ticket.assigned', async () => {
      const created = ticketFixture({ status: 'assigned', assigneeId: 'u-op', reactionDeadline: null });
      prisma.ticket.create.mockResolvedValue(created);

      await service.create(
        { type: 'planned', objectId: 'obj-1', description: 'Уборка', assigneeId: 'u-op' },
        USER,
      );

      const data = prisma.ticket.create.mock.calls[0][0].data as Prisma.TicketUncheckedCreateInput;
      expect(data.status).toBe('assigned');
      expect(data.assignedAt).toEqual(NOW);
      expect(data.acceptedAt).toEqual(NOW);
      expect(data.arrivalDeadline).toEqual(new Date('2026-01-01T10:15:00.000Z'));
      // Таймер реакции не нужен: исполнитель назначен сразу.
      expect(data.reactionDeadline).toBeNull();
      expect(data.assignments).toEqual({
        create: { assigneeId: 'u-op', assignedBy: 'u-admin', assignedAt: NOW },
      });
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_ASSIGNED, {
        ticketId: 't-1',
        assigneeId: 'u-op',
      });
    });

    it('недоступность брокера (publish=false) не роняет создание заявки', async () => {
      prisma.ticket.create.mockResolvedValue(ticketFixture());
      publisher.publish.mockResolvedValue(false);

      await expect(
        service.create({ type: 'planned', objectId: 'obj-1', description: 'Уборка' }, USER),
      ).resolves.toBeDefined();
    });

    it('дефолтные длительности таймеров (5/15/60 мин), если конфиг пуст', async () => {
      prisma.ticket.create.mockResolvedValue(ticketFixture());
      const bare = new TicketsService(
        prisma as unknown as PrismaService,
        publisher as unknown as EventsPublisher,
        gps as unknown as GpsClient,
        { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      );

      await bare.create({ type: 'planned', objectId: 'obj-1', description: 'Уборка' }, USER);

      const data = prisma.ticket.create.mock.calls[0][0].data as Prisma.TicketUncheckedCreateInput;
      expect(data.reactionDeadline).toEqual(new Date('2026-01-01T10:05:00.000Z'));

      await bare.create(
        { type: 'planned', objectId: 'obj-1', description: 'Уборка', assigneeId: 'u-op' },
        USER,
      );
      const assigned = prisma.ticket.create.mock.calls[1][0].data as Prisma.TicketUncheckedCreateInput;
      expect(assigned.arrivalDeadline).toEqual(new Date('2026-01-01T10:15:00.000Z'));
    });
  });

  describe('createEmergency (М3.5, SOS)', () => {
    const dto = {
      objectId: 'obj-1',
      description: 'Прорыв трубы',
      lat: 55.75,
      lng: 37.61,
      objectName: 'БЦ «Северный»',
      floor: '3',
    };

    it('создаёт CRITICAL-заявку типа emergency и публикует ticket.emergency по контракту 3.2', async () => {
      prisma.ticket.create.mockResolvedValue(
        ticketFixture({ type: 'emergency', priority: 'critical' }),
      );
      gps.findNearbyEmployees.mockResolvedValue([{ userId: 'u-op-1', distanceMeters: 120 }]);

      const result = await service.createEmergency(dto, USER, 'token-abc');

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'emergency',
          priority: 'critical',
          status: 'new',
          reactionDeadline: new Date('2026-01-01T10:05:00.000Z'),
        }),
      });
      // Токен вызывающего пользователя пробрасывается в gps-service.
      expect(gps.findNearbyEmployees).toHaveBeenCalledWith(55.75, 37.61, undefined, 'token-abc');
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_EMERGENCY, {
        ticketId: 't-1',
        type: 'emergency',
        objectName: 'БЦ «Северный»',
        floor: '3',
        lat: 55.75,
        lng: 37.61,
        // Аддитивное расширение для notification-service: исполнителя нет → рассылка всем.
        assigneeId: null,
      });
      // Заявка + найденные операторы для мобильного UI.
      expect(result.nearbyOperators).toEqual([{ userId: 'u-op-1', distanceMeters: 120 }]);
      expect(result.id).toBe('t-1');
    });

    it('gps-service недоступен: заявка всё равно создаётся, список операторов пуст', async () => {
      prisma.ticket.create.mockResolvedValue(
        ticketFixture({ type: 'emergency', priority: 'critical' }),
      );
      gps.findNearbyEmployees.mockResolvedValue([]);

      const result = await service.createEmergency(dto, USER);

      expect(result.id).toBe('t-1');
      expect(result.nearbyOperators).toEqual([]);
      // Событие всё равно уходит: рассылку делает notification-service.
      expect(publisher.publish).toHaveBeenCalledWith(
        ROUTING_KEYS.TICKET_EMERGENCY,
        expect.objectContaining({ ticketId: 't-1' }),
      );
    });

    it('без objectName/floor в событие попадают objectId и пустая строка (нет геокодинга в core)', async () => {
      prisma.ticket.create.mockResolvedValue(
        ticketFixture({ objectId: 'obj-9', type: 'emergency', priority: 'critical' }),
      );

      await service.createEmergency(
        { objectId: 'obj-9', description: 'Авария', lat: 1, lng: 2 },
        USER,
      );

      expect(publisher.publish).toHaveBeenCalledWith(
        ROUTING_KEYS.TICKET_EMERGENCY,
        expect.objectContaining({ objectName: 'obj-9', floor: '' }),
      );
    });

    it('радиус поиска из запроса доходит до gps-service', async () => {
      prisma.ticket.create.mockResolvedValue(ticketFixture({ type: 'emergency', priority: 'critical' }));

      await service.createEmergency({ ...dto, radiusM: 300 }, USER, 'token');

      expect(gps.findNearbyEmployees).toHaveBeenCalledWith(55.75, 37.61, 300, 'token');
    });
  });

  // -------------------------------------------------------------------- чтение

  describe('list', () => {
    it('без фильтров: пагинация по умолчанию и take не больше 100', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await expect(service.list({})).resolves.toEqual({ items: [], total: 0 });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 50, orderBy: { createdAt: 'desc' } }),
      );
      expect(prisma.ticket.count).toHaveBeenCalledWith({ where: {} });
    });

    it('фильтры status/type/priority/objectId/assigneeId попадают в where', async () => {
      prisma.ticket.findMany.mockResolvedValue([ticketFixture()]);
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.list({
        status: 'assigned',
        type: 'emergency',
        priority: 'critical',
        objectId: 'obj-1',
        assigneeId: 'u-op',
        skip: 5,
        take: 10,
      });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'assigned',
            type: 'emergency',
            priority: 'critical',
            objectId: 'obj-1',
            assigneeId: 'u-op',
          },
          skip: 5,
          take: 10,
        }),
      );
      expect(result.total).toBe(1);
    });

    it('take ограничивается сотней записей', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.list({ take: 500 });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('поиск уходит в description/id/objectId без учёта регистра', async () => {
      prisma.ticket.findMany.mockResolvedValue([ticketFixture()]);
      prisma.ticket.count.mockResolvedValue(1);

      await service.list({ search: 'УБОРКА' });

      // Регистронезависимость — приём соседних сервисов (Prisma contains + mode insensitive);
      // запрос уходит на сервер как есть, без приведения регистра на клиенте.
      const or = [
        { description: { contains: 'УБОРКА', mode: 'insensitive' } },
        { id: { contains: 'УБОРКА', mode: 'insensitive' } },
        { objectId: { contains: 'УБОРКА', mode: 'insensitive' } },
      ];
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: or } }),
      );
      // Тот же where и в count: иначе total расходился бы с выдачей.
      expect(prisma.ticket.count).toHaveBeenCalledWith({ where: { OR: or } });
    });

    it('поиск комбинируется с фильтрами (AND, а не подмена фильтра)', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.list({ status: 'assigned', search: 'холл' });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'assigned',
            OR: [
              { description: { contains: 'холл', mode: 'insensitive' } },
              { id: { contains: 'холл', mode: 'insensitive' } },
              { objectId: { contains: 'холл', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('находит по подстроке в каждом из выбранных полей', async () => {
      prisma.ticket.count.mockResolvedValue(1);

      // По описанию: подстрока в середине слова.
      prisma.ticket.findMany.mockResolvedValue([ticketFixture({ description: 'Влажная уборка холла' })]);
      await expect(service.list({ search: 'уборк' })).resolves.toEqual({
        items: [expect.objectContaining({ description: 'Влажная уборка холла' })],
        total: 1,
      });

      // По id: короткий id заявки копируют из селекта/адреса.
      prisma.ticket.findMany.mockResolvedValue([ticketFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000001' })]);
      const byId = await service.list({ search: 'a1b2c3d4' });
      expect(byId.items).toHaveLength(1);
      expect(byId.items[0].id).toBe('a1b2c3d4-0000-4000-8000-000000000001');

      // По объекту: у заявки нет адреса, «адресная» привязка — objectId.
      prisma.ticket.findMany.mockResolvedValue([ticketFixture({ objectId: 'obj-север-7' })]);
      const byObject = await service.list({ search: 'север' });
      expect(byObject.items).toHaveLength(1);
      expect(byObject.items[0].objectId).toBe('obj-север-7');
    });

    it('по мусорному запросу возвращает пустую выдачу (подгонки на клиенте нет)', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await expect(service.list({ search: 'ззз-нет-такой-заявки' })).resolves.toEqual({
        items: [],
        total: 0,
      });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { description: { contains: 'ззз-нет-такой-заявки', mode: 'insensitive' } },
              { id: { contains: 'ззз-нет-такой-заявки', mode: 'insensitive' } },
              { objectId: { contains: 'ззз-нет-такой-заявки', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('без search и с пустой строкой/пробелами фильтра по тексту нет', async () => {
      prisma.ticket.findMany.mockResolvedValue([ticketFixture()]);
      prisma.ticket.count.mockResolvedValue(1);

      await service.list({});
      expect(prisma.ticket.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: {} }),
      );

      // Пустая строка и строка из пробелов — то же самое, что отсутствие параметра.
      await service.list({ search: '' });
      await service.list({ search: '   ' });
      expect(prisma.ticket.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(prisma.ticket.count).toHaveBeenLastCalledWith({ where: {} });
    });
  });

  describe('getDetail', () => {
    it('возвращает карточку с историей, комментариями и числом завершённых операций', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketFixture(),
        assignments: [{ id: 'a-1' }],
        comments: [{ id: 'c-1' }],
        operations: [{ id: 'o-1' }, { id: 'o-2' }],
      });

      const result = await service.getDetail('t-1');

      expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: 't-1' },
        include: {
          assignments: { orderBy: { assignedAt: 'asc' } },
          comments: { orderBy: { createdAt: 'asc' } },
          operations: { orderBy: { completedAt: 'asc' } },
        },
      });
      expect(result.operationsCompleted).toBe(2);
    });

    it('несуществующая заявка → 404', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('nope')).rejects.toThrow(NotFoundException);
      await expect(service.getDetail('nope')).rejects.toThrow('Заявка не найдена');
    });
  });

  // ---------------------------------------------------------- статусы и тайминги

  describe('changeStatus (state machine М3.4)', () => {
    it('валидный переход new → assigned проставляет тайминги и дедлайны', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'assigned' }));

      await service.changeStatus('t-1', { status: 'assigned' }, USER);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          status: 'assigned',
          assignedAt: NOW,
          acceptedAt: NOW,
          reactionDeadline: null,
          arrivalDeadline: new Date('2026-01-01T10:15:00.000Z'),
        }),
      });
      // В OVERDUE не уходили — ticket.overdue не публикуется.
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('валидный переход assigned → in_progress фиксирует прибытие и дедлайн выполнения', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'assigned' }));
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'in_progress' }));

      await service.changeStatus('t-1', { status: 'in_progress' }, USER);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          status: 'in_progress',
          arrivedAt: NOW,
          completionDeadline: new Date('2026-01-01T11:00:00.000Z'),
        }),
      });
    });

    it('пауза не трогает дедлайн выполнения (из паузы возможен overdue)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'in_progress' }));
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'paused' }));

      await service.changeStatus('t-1', { status: 'paused' }, USER);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: 'paused' },
      });
    });

    it('переходы completed → verified → closed проставляют соответствующие времена', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'completed' }));
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'verified' }));
      await service.changeStatus('t-1', { status: 'verified' }, USER);
      expect(prisma.ticket.update).toHaveBeenLastCalledWith({
        where: { id: 't-1' },
        data: { status: 'verified', verifiedAt: NOW },
      });

      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'verified' }));
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'closed' }));
      await service.changeStatus('t-1', { status: 'closed' }, USER);
      expect(prisma.ticket.update).toHaveBeenLastCalledWith({
        where: { id: 't-1' },
        data: {
          status: 'closed',
          closedAt: NOW,
          reactionDeadline: null,
          arrivalDeadline: null,
          completionDeadline: null,
        },
      });
    });

    it('ручной переход в overdue публикует ticket.overdue с числом минут просрочки', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'assigned',
          arrivalDeadline: new Date('2026-01-01T09:45:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'overdue' }));

      await service.changeStatus('t-1', { status: 'overdue' }, USER);

      // 15 минут просрочки дедлайна прибытия.
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 15,
        assigneeId: null,
      });
    });

    it('НЕвалидный переход → 400 «Invalid status transition» (тест-кейс устава)', async () => {
      // closed — терминальный статус: из него нет ни одного перехода.
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'closed' }));

      await expect(service.changeStatus('t-1', { status: 'in_progress' }, USER)).rejects.toThrow(
        new BadRequestException(INVALID_TRANSITION_MESSAGE),
      );
      await expect(service.changeStatus('t-1', { status: 'in_progress' }, USER)).rejects.toThrow(
        'Invalid status transition',
      );
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('переход new → closed тоже запрещён (только assigned/rejected)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());

      await expect(service.changeStatus('t-1', { status: 'closed' }, USER)).rejects.toThrow(
        'Invalid status transition',
      );
    });

    it('заявка не найдена → 404', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.changeStatus('nope', { status: 'assigned' }, USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------- назначение / комментарии

  describe('assign', () => {
    it('назначение new → assigned пишет историю и эмитит ticket.assigned', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      const updated = ticketFixture({ status: 'assigned', assigneeId: 'u-op' });
      prisma.ticket.update.mockResolvedValue(updated);
      prisma.ticketAssignment.create.mockResolvedValue({ id: 'a-1' });

      await expect(service.assign('t-1', { assigneeId: 'u-op' }, USER)).resolves.toBe(updated);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          assigneeId: 'u-op',
          status: 'assigned',
          assignedAt: NOW,
          acceptedAt: NOW,
          reactionDeadline: null,
          arrivalDeadline: new Date('2026-01-01T10:15:00.000Z'),
        }),
      });
      expect(prisma.ticketAssignment.create).toHaveBeenCalledWith({
        data: { ticketId: 't-1', assigneeId: 'u-op', assignedBy: 'u-admin', assignedAt: NOW },
      });
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_ASSIGNED, {
        ticketId: 't-1',
        assigneeId: 'u-op',
      });
    });

    it('смена исполнителя разрешена, пока заявка в статусе assigned', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'assigned',
          assigneeId: 'u-old',
          acceptedAt: new Date('2026-01-01T09:00:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'assigned', assigneeId: 'u-new' }));

      await service.assign('t-1', { assigneeId: 'u-new' }, USER);

      // Время первого принятия сохраняется.
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          acceptedAt: new Date('2026-01-01T09:00:00.000Z'),
          assigneeId: 'u-new',
        }),
      });
    });

    it('назначение из терминального статуса → 400', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'closed' }));

      await expect(service.assign('t-1', { assigneeId: 'u-op' }, USER)).rejects.toThrow(
        'Invalid status transition',
      );
      expect(prisma.ticketAssignment.create).not.toHaveBeenCalled();
    });

    it('заявка не найдена → 404', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.assign('nope', { assigneeId: 'u-op' }, USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addComment', () => {
    it('создаёт комментарий с автором из токена', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      const comment = { id: 'c-1', ticketId: 't-1', authorId: 'u-admin', text: 'Принято' };
      prisma.ticketComment.create.mockResolvedValue(comment);

      await expect(service.addComment('t-1', { text: 'Принято' }, USER)).resolves.toBe(comment);

      expect(prisma.ticketComment.create).toHaveBeenCalledWith({
        data: { ticketId: 't-1', authorId: 'u-admin', text: 'Принято' },
      });
    });

    it('комментарий к несуществующей заявке → 404', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.addComment('nope', { text: 'x' }, USER)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------- операции техкарты

  describe('completeOperation (М3.6)', () => {
    const completion = {
      id: 'oc-1',
      ticketId: 't-1',
      operationId: 'op-1',
      completedAt: NOW,
      photoUrl: null,
      completedBy: 'u-admin',
      createdAt: NOW,
    };

    it('фиксирует операцию и эмитит ticket.operation.completed по контракту 3.2', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      const result = await service.completeOperation('t-1', 'op-1', {}, USER);

      expect(prisma.ticketOperationCompletion.create).toHaveBeenCalledWith({
        data: {
          ticketId: 't-1',
          operationId: 'op-1',
          completedAt: NOW,
          photoUrl: null,
          completedBy: 'u-admin',
        },
      });
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OPERATION_COMPLETED, {
        operationId: 'op-1',
        ticketId: 't-1',
        objectId: 'obj-1',
        completedAt: NOW.toISOString(),
      });
      expect(result.alreadyCompleted).toBe(false);
      expect(result.completedOperations).toBe(1);
      expect(result.completedAt).toBe(NOW.toISOString());
    });

    it('идемпотентность: повторный вызов не создаёт запись и НЕ публикует событие второй раз', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      const result = await service.completeOperation('t-1', 'op-1', {}, USER);

      expect(result.alreadyCompleted).toBe(true);
      expect(prisma.ticketOperationCompletion.create).not.toHaveBeenCalled();
      // Ровно один раз за оба вызова: material-service не спишет материалы дважды.
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('гонка двух одновременных вызовов (P2002) — тоже идемпотентный повтор', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(completion);
      prisma.ticketOperationCompletion.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      const result = await service.completeOperation('t-1', 'op-1', {}, USER);

      expect(result.alreadyCompleted).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('прочие ошибки Prisma пробрасываются, а не маскируются под повтор', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.completeOperation('t-1', 'op-1', {}, USER)).rejects.toThrow(
        'connection lost',
      );
    });

    it('requiresPhoto без photoUrl → 400 и ничего не пишется', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());

      await expect(
        service.completeOperation('t-1', 'op-1', { requiresPhoto: true }, USER),
      ).rejects.toThrow('Для операции требуется фото (photoUrl)');
      expect(prisma.ticketOperationCompletion.create).not.toHaveBeenCalled();
    });

    it('requiresPhoto с photoUrl фиксирует фото', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue({
        ...completion,
        photoUrl: 'http://files/photo.jpg',
      });
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      const result = await service.completeOperation(
        't-1',
        'op-1',
        { requiresPhoto: true, photoUrl: 'http://files/photo.jpg' },
        USER,
      );

      expect(result.photoUrl).toBe('http://files/photo.jpg');
    });

    it('время завершения можно передать явно (офлайн-синхронизация с мобильного)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      await service.completeOperation(
        't-1',
        'op-1',
        { completedAt: '2025-12-31T20:00:00.000Z' },
        USER,
      );

      expect(prisma.ticketOperationCompletion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ completedAt: new Date('2025-12-31T20:00:00.000Z') }),
      });
    });

    it('totalOperations запоминается в заявке и даёт allOperationsCompleted на последней операции', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(2);
      prisma.ticket.update.mockResolvedValue(ticketFixture({ operationsTotal: 2 }));

      const result = await service.completeOperation(
        't-1',
        'op-2',
        { totalOperations: 2 },
        USER,
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { operationsTotal: 2 },
      });
      expect(result.operationsTotal).toBe(2);
      expect(result.allOperationsCompleted).toBe(true);
    });

    it('если в заявке уже есть operationsTotal, значение из запроса не перезаписывает его', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ operationsTotal: 5 }));
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(1);

      const result = await service.completeOperation('t-1', 'op-1', { totalOperations: 2 }, USER);

      expect(prisma.ticket.update).not.toHaveBeenCalled();
      expect(result.operationsTotal).toBe(5);
      expect(result.allOperationsCompleted).toBe(false);
    });

    it('без operationsTotal признак «все операции» не выставляется', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticketOperationCompletion.findUnique.mockResolvedValue(null);
      prisma.ticketOperationCompletion.create.mockResolvedValue(completion);
      prisma.ticketOperationCompletion.count.mockResolvedValue(3);

      const result = await service.completeOperation('t-1', 'op-1', {}, USER);

      expect(result.operationsTotal).toBeNull();
      expect(result.allOperationsCompleted).toBe(false);
    });

    it('заявка не найдена → 404', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.completeOperation('nope', 'op-1', {}, USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------ служебное (сканер)

  describe('markOverdue / escalateUnaccepted (для сканера М3.5)', () => {
    it('markOverdue переводит assigned с истёкшим дедлайном в overdue и публикует ticket.overdue', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'assigned',
          arrivalDeadline: new Date('2026-01-01T09:53:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'overdue' }));

      const result = await service.markOverdue('t-1', NOW);

      expect(result).not.toBeNull();
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          status: 'overdue',
          overdueAt: NOW,
          arrivalDeadline: null,
          completionDeadline: null,
        }),
      });
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 7,
        assigneeId: null,
      });
    });

    it('markOverdue адресует уведомление исполнителю, если он назначен (расширение М3.3)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'assigned',
          assigneeId: 'u-op-7',
          arrivalDeadline: new Date('2026-01-01T09:53:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(
        ticketFixture({ status: 'overdue', assigneeId: 'u-op-7' }),
      );

      await service.markOverdue('t-1', NOW);

      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 7,
        assigneeId: 'u-op-7',
      });
    });

    it('markOverdue для in_progress считает просрочку по дедлайну выполнения', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'in_progress',
          completionDeadline: new Date('2026-01-01T09:00:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'overdue' }));

      await service.markOverdue('t-1', NOW);

      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 60,
        assigneeId: null,
      });
    });

    it('markOverdue не трогает заявку, которую успели закрыть (гонка со сканером)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'closed' }));

      await expect(service.markOverdue('t-1', NOW)).resolves.toBeNull();
      expect(prisma.ticket.update).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('markOverdue для несуществующей заявки возвращает null', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.markOverdue('nope', NOW)).resolves.toBeNull();
    });

    it('escalateUnaccepted эскалирует непринятую NEW: escalatedAt + ticket.overdue', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture());
      prisma.ticket.update.mockResolvedValue(ticketFixture());

      const result = await service.escalateUnaccepted('t-1', NOW);

      expect(result).not.toBeNull();
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { escalatedAt: NOW, reactionDeadline: null },
      });
      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 5,
        assigneeId: null,
      });
    });

    it('escalateUnaccepted не эскалирует повторно (escalatedAt уже стоит)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ escalatedAt: NOW }));

      await expect(service.escalateUnaccepted('t-1', NOW)).resolves.toBeNull();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('escalateUnaccepted пропускает заявку, которую уже приняли', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ status: 'assigned' }));

      await expect(service.escalateUnaccepted('t-1', NOW)).resolves.toBeNull();
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('escalateUnaccepted для несуществующей заявки возвращает null', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.escalateUnaccepted('nope', NOW)).resolves.toBeNull();
    });

    it('просрочка не меньше порога таймера, даже если сканер опоздал', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        // Заявка создана 1 минуту назад, но сканер вызван с «будущим» now.
        ticketFixture({ createdAt: new Date('2026-01-01T10:00:00.000Z') }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture());

      await service.escalateUnaccepted('t-1', new Date('2026-01-01T10:00:30.000Z'));

      expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        // 0.5 мин округляется вниз до 0 → берём порог таймера (5 мин).
        minutesOverdue: 5,
        assigneeId: null,
      });
    });

    it('служебные методы используют текущее время, если оно не передано (дефолт параметра)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(
        ticketFixture({
          status: 'assigned',
          arrivalDeadline: new Date('2026-01-01T09:50:00.000Z'),
        }),
      );
      prisma.ticket.update.mockResolvedValue(ticketFixture({ status: 'overdue' }));

      await service.markOverdue('t-1');

      expect(publisher.publish).toHaveBeenLastCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 10,
        assigneeId: null,
      });
    });

    it('эскалация без дедлайна реакции не считает нулевую просрочку (берёт порог)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketFixture({ reactionDeadline: null }));
      prisma.ticket.update.mockResolvedValue(ticketFixture());

      await service.escalateUnaccepted('t-1');

      expect(publisher.publish).toHaveBeenLastCalledWith(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-1',
        minutesOverdue: 5,
        assigneeId: null,
      });
    });
  });
});
