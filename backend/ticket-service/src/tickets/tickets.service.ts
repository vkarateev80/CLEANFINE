import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Ticket } from '@prisma/client';
import {
  INVALID_TRANSITION_MESSAGE,
  canTransition,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from '@cleaning-ops/shared/types/tickets';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  notificationTargets,
  statusChangedPayload,
  type TicketAssignedPayload,
  type TicketCreatedPayload,
  type TicketEmergencyPayload,
  type TicketOverduePayload,
} from '../events/event-payloads';
import { EventsPublisher } from '../events/events.publisher';
import { GpsClient, type NearbyEmployee } from '../gps/gps.client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AssignTicketDto,
  CompleteOperationDto,
  CompleteRoomDto,
  CreateCommentDto,
  EmergencyTicketDto,
  ListTicketsQueryDto,
  UpdateStatusDto,
  UpdateTicketDto,
} from './dto/ticket.dto';
import {
  addMinutes,
  minutesBetween,
  reactionDeadline,
  statusOverrideUpdates,
  timingUpdatesFor,
  type EscalationDurations,
} from './ticket-timings';

/**
 * Счётчики связей для листинга. Значение по умолчанию — для заявок без связей:
 * его же читает админка (`TicketsPage.tsx`), поэтому форма ответа неизменна.
 */
const EMPTY_RELATION_COUNTS = { assignments: 0, comments: 0, operations: 0, rooms: 0 } as const;

/** Вход создания заявки: DTO API и внутренние вызовы (SOS) сведены к одной форме. */
export interface CreateTicketInput {
  /** Окно смены (ISO 8601), оба края вместе: заявку создал schedule-service по смене. */
  plannedStart?: string;
  plannedEnd?: string;
  type: TicketType;
  priority?: TicketPriority;
  objectId: string;
  roomId?: string;
  assigneeId?: string;
  description: string;
  lat?: number;
  lng?: number;
}

/**
 * Ответ SOS-эндпоинта: сама заявка (как у обычного POST /api/tickets, чтобы клиент
 * читал `id`/`status` одинаково) + найденные gps-service операторы для UI мобильного.
 */
export type EmergencyResult = Ticket & { nearbyOperators: NearbyEmployee[] };

/** Ответ М3.6: факт завершения операции + признак «все операции заявки завершены». */
export interface CompleteOperationResult {
  ticketId: string;
  operationId: string;
  /** Помещение маршрута; "" — операция без привязки к помещению. */
  roomId: string;
  objectId: string;
  completedAt: string;
  photoUrl: string | null;
  /** true — операция уже была отмечена ранее, событие повторно не публиковалось. */
  alreadyCompleted: boolean;
  completedOperations: number;
  operationsTotal: number | null;
  allOperationsCompleted: boolean;
}

/** Ответ завершения помещения маршрута (пробел API М6.4). */
export interface CompleteRoomResult {
  ticketId: string;
  roomId: string;
  completedAt: string;
  /** true — помещение уже было отмечено ранее. */
  alreadyCompleted: boolean;
  completedRooms: number;
  roomsTotal: number | null;
  allRoomsCompleted: boolean;
}

/**
 * Заявки: CRUD, state machine, назначение, комментарии, операции техкарты
 * (М3.4–М3.6). State machine берётся из shared/types/tickets.ts — таблица переходов
 * здесь не дублируется.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventsPublisher,
    private readonly gps: GpsClient,
    private readonly config: ConfigService,
  ) {}

  private get durations(): EscalationDurations {
    return {
      newToAcceptMin: this.config.get<number>('escalation.newToAcceptMin') ?? 5,
      acceptToArriveMin: this.config.get<number>('escalation.acceptToArriveMin') ?? 15,
      arriveToDoneMin: this.config.get<number>('escalation.arriveToDoneMin') ?? 60,
    };
  }

  // ---------------------------------------------------------------- создание

  /**
   * Создание плановой/внеплановой заявки (М3.4).
   * Если исполнитель задан сразу (например, schedule-service, М4.4), заявка
   * создаётся в статусе assigned и получает дедлайн прибытия; заявка по смене
   * (с окном plannedStart/plannedEnd, 22.10.2026) — дедлайн выполнения к концу смены.
   */
  async create(input: CreateTicketInput, user: AuthUser): Promise<Ticket> {
    const now = new Date();
    const durations = this.durations;
    const assigneeId = input.assigneeId ?? null;
    const window = plannedWindowOf(input);

    const data: Prisma.TicketUncheckedCreateInput = {
      type: input.type,
      priority: input.priority ?? 'normal',
      status: assigneeId ? 'assigned' : 'new',
      objectId: input.objectId,
      roomId: input.roomId ?? null,
      assigneeId,
      createdBy: user.id,
      description: input.description,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      plannedStart: window?.start ?? null,
      plannedEnd: window?.end ?? null,
      // Таймер реакции (М3.5): NEW обязан быть принят за ESCALATION_NEW_TO_ACCEPT_MIN.
      reactionDeadline: assigneeId ? null : reactionDeadline(now, durations),
    };

    if (assigneeId) {
      data.assignedAt = now;
      data.acceptedAt = now;
      if (window) {
        // Заявка смены: выполнить к концу смены. «Прибыть за 15 минут» здесь
        // бессмысленно — смена начнётся позже, а неявку ловит schedule-service.
        data.completionDeadline = window.end;
      } else {
        data.arrivalDeadline = addMinutes(now, durations.acceptToArriveMin);
      }
      data.assignments = {
        create: { assigneeId, assignedBy: user.id, assignedAt: now },
      };
    }

    const ticket = await this.prisma.ticket.create({ data });
    this.logger.log(
      `Заявка ${ticket.id} создана: ${ticket.type}/${ticket.priority}, статус ${ticket.status}`,
    );

    const createdPayload: TicketCreatedPayload = {
      ticketId: ticket.id,
      assigneeId: ticket.assigneeId ?? '',
      description: ticket.description,
      ...(window
        ? { plannedStart: window.start.toISOString(), plannedEnd: window.end.toISOString() }
        : {}),
    };
    await this.publisher.publish(ROUTING_KEYS.TICKET_CREATED, createdPayload);
    if (!ticket.assigneeId && user.role === 'CLIENT' && ticket.type !== 'emergency') {
      // Заявка заказчика без исполнителя (портал, 07.11.2026). ticket.created адресован
      // исполнителю — без него notification-service уведомление не шлёт, а портал
      // обещает, что менеджер увидит заявку сразу. Публикуем переход «→ new» с пустым
      // previousStatus: его получают бригадиры, менеджеры и админы (автор — инициатор,
      // ему не приходит). SOS исключён — у него своё ticket.emergency.
      await this.publisher.publish(
        ROUTING_KEYS.TICKET_STATUS_CHANGED,
        statusChangedPayload(ticket, 'new', '', user, now),
      );
    }
    if (ticket.assigneeId) {
      const assignedPayload: TicketAssignedPayload = {
        ticketId: ticket.id,
        assigneeId: ticket.assigneeId,
        // Уведомление исполнителю уже ушло по ticket.created.
        onCreate: true,
      };
      await this.publisher.publish(ROUTING_KEYS.TICKET_ASSIGNED, assignedPayload);
    }
    return ticket;
  }

  /**
   * Аварийная заявка (SOS, М3.5):
   *  1) CRITICAL-заявка + таймер реакции;
   *  2) ближние операторы из gps-service (недоступность gps не мешает созданию);
   *  3) событие ticket.emergency — рассылку делает notification-service.
   */
  async createEmergency(
    dto: EmergencyTicketDto,
    user: AuthUser,
    token?: string,
  ): Promise<EmergencyResult> {
    const ticket = await this.create(
      {
        type: 'emergency',
        priority: 'critical',
        objectId: dto.objectId,
        roomId: dto.roomId,
        description: dto.description,
        lat: dto.lat,
        lng: dto.lng,
      },
      user,
    );

    const nearbyOperators = await this.gps.findNearbyEmployees(
      dto.lat,
      dto.lng,
      dto.radiusM,
      token,
    );
    if (nearbyOperators.length === 0) {
      this.logger.warn(
        `SOS ${ticket.id}: ближние операторы не найдены (gps-service недоступен или пустой радиус)`,
      );
    } else {
      this.logger.warn(`SOS ${ticket.id}: найдено ${nearbyOperators.length} операторов поблизости`);
    }

    // Аддитивное расширение для notification-service: assigneeId (обычно null — SOS создаётся
    // без исполнителя, тогда consumer рассылает всем: оператор + бригадир + админ).
    const emergencyPayload: TicketEmergencyPayload = {
      ticketId: ticket.id,
      type: ticket.type,
      objectName: dto.objectName ?? ticket.objectId,
      floor: dto.floor ?? '',
      lat: dto.lat,
      lng: dto.lng,
      ...notificationTargets(ticket),
    };
    await this.publisher.publish(ROUTING_KEYS.TICKET_EMERGENCY, emergencyPayload);

    return { ...ticket, nearbyOperators };
  }

  // ------------------------------------------------------------------ чтение

  async list(query: ListTicketsQueryDto) {
    const where: Prisma.TicketWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.objectId) where.objectId = query.objectId;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    /*
     * Поиск (М4.3). Выбор только из полей, которые у заявки реально есть:
     *  • `description` — единственный содержательный текст («влажная уборка холла»),
     *    по нему заявку и ищут;
     *  • `id` — короткий id виден в селекте движения, и его копируют из адреса;
     *  • `objectId` — адреса у заявки нет (адрес живёт в core-service, а FK между
     *    сервисами запрещён), поэтому «адресная» привязка заявки — это объект.
     * `roomId`/`assigneeId`/`createdBy` не ищем: это uuid, которые пользователь
     * не набирает руками, а `assigneeId` уже есть отдельным фильтром.
     * Пусто/пробелы = без фильтра: пустой `contains: ''` вернул бы всё, но лишний
     * OR только мешал бы индексам и ломал тесты «без параметра возвращает всё».
     */
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { objectId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
      }),
      this.prisma.ticket.count({ where }),
    ]);

    /*
     * Счётчики связей (М7.2). Раньше здесь стоял `include: { _count: … }`, и Prisma
     * разворачивала его в три LEFT JOIN с `GROUP BY` по ВСЕЙ дочерней таблице:
     *     LEFT JOIN (SELECT "ticketId", COUNT(*) FROM ticket_comments GROUP BY "ticketId") …
     * То есть стоимость листинга росла не с размером страницы, а с общим числом
     * комментариев/назначений/операций. Замер на 200 000 заявок и 700 000 дочерних строк
     * (`EXPLAIN (ANALYZE, BUFFERS)` — test/performance/results/explain/tickets-listing-before.txt):
     * 9,9 с на один запрос листинга, план — Parallel Seq Scan + три Merge Left Join
     * с `Sort Method: external merge Disk: 3440kB`.
     *
     * Замена даёт тот же контракт (`item._count.{assignments,comments,operations}`,
     * его читает `TicketsPage.tsx`), но агрегирует только по id текущей страницы
     * (≤100 значений) через индексы `*_ticketId_idx`. Тот же запрос после правки —
     * test/performance/results/explain/tickets-listing-after.txt: страница 3,2 мс,
     * счётчики 9,0 мс (`Index Only Scan … loops=50`).
     */
    const counts = await this.relationCounts(items.map((ticket) => ticket.id));

    return {
      items: items.map((ticket) => ({
        ...ticket,
        _count: counts.get(ticket.id) ?? EMPTY_RELATION_COUNTS,
      })),
      total,
    };
  }

  /**
   * Число назначений, комментариев и завершённых операций — только для переданных id.
   * Три запроса вместо одного `include._count`: каждый идёт по индексу `ticketId` и
   * агрегирует строки страницы, а не таблицу целиком.
   */
  private async relationCounts(
    ticketIds: string[],
  ): Promise<
    Map<string, { assignments: number; comments: number; operations: number; rooms: number }>
  > {
    const counts = new Map<
      string,
      { assignments: number; comments: number; operations: number; rooms: number }
    >();
    if (ticketIds.length === 0) {
      return counts;
    }

    const [assignments, comments, operations, rooms] = await Promise.all([
      this.prisma.ticketAssignment.groupBy({
        by: ['ticketId'],
        where: { ticketId: { in: ticketIds } },
        _count: { _all: true },
      }),
      this.prisma.ticketComment.groupBy({
        by: ['ticketId'],
        where: { ticketId: { in: ticketIds } },
        _count: { _all: true },
      }),
      this.prisma.ticketOperationCompletion.groupBy({
        by: ['ticketId'],
        where: { ticketId: { in: ticketIds } },
        _count: { _all: true },
      }),
      // Завершённые помещения — прогресс маршрута в списке/на доске (12.10.2026).
      this.prisma.ticketRoomCompletion.groupBy({
        by: ['ticketId'],
        where: { ticketId: { in: ticketIds } },
        _count: { _all: true },
      }),
    ]);

    for (const ticketId of ticketIds) {
      counts.set(ticketId, { ...EMPTY_RELATION_COUNTS });
    }
    for (const row of assignments) {
      const entry = counts.get(row.ticketId);
      if (entry) entry.assignments = row._count._all;
    }
    for (const row of comments) {
      const entry = counts.get(row.ticketId);
      if (entry) entry.comments = row._count._all;
    }
    for (const row of operations) {
      const entry = counts.get(row.ticketId);
      if (entry) entry.operations = row._count._all;
    }
    for (const row of rooms) {
      const entry = counts.get(row.ticketId);
      if (entry) entry.rooms = row._count._all;
    }

    return counts;
  }

  /** Карточка заявки: история назначений, комментарии, завершённые операции. */
  async getDetail(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        assignments: { orderBy: { assignedAt: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        operations: { orderBy: { completedAt: 'asc' } },
        // Завершённые помещения маршрута — для цветового прогресса у админа (12.10.2026).
        rooms: { orderBy: { completedAt: 'asc' } },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Заявка не найдена');
    }
    return {
      ...ticket,
      operationsCompleted: ticket.operations.length,
      roomsCompleted: ticket.rooms.length,
    };
  }

  async getTicketOrFail(id: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Заявка не найдена');
    }
    return ticket;
  }

  // --------------------------------------------- администрирование (только ADMIN)

  /**
   * Правка заявки администратором (01.11.2026): любые поля и любой статус, включая
   * выполненные и закрытые заявки. Обычные переходы по-прежнему идут через
   * `changeStatus` и state machine; здесь её намеренно нет.
   */
  async update(id: string, dto: UpdateTicketDto, user: AuthUser): Promise<Ticket> {
    const ticket = await this.getTicketOrFail(id);
    const now = new Date();

    const nextAssignee =
      dto.assigneeId === undefined ? ticket.assigneeId : (dto.assigneeId ?? null) || null;
    const assigneeChanged = nextAssignee !== ticket.assigneeId;
    const nextStatus = dto.status ?? impliedStatus(ticket.status, nextAssignee);
    const statusChanged = nextStatus !== ticket.status;
    if (statusChanged || assigneeChanged) {
      assertStatusFitsAssignee(nextStatus, nextAssignee);
    }

    const data: Prisma.TicketUncheckedUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.objectId !== undefined && dto.objectId !== ticket.objectId) {
      data.objectId = dto.objectId;
      // Помещение принадлежит объекту: прежнее у нового объекта не существует.
      data.roomId = null;
    }
    if (dto.roomId !== undefined) data.roomId = dto.roomId || null;

    if (statusChanged) {
      data.status = nextStatus;
      Object.assign(data, statusOverrideUpdates(nextStatus, now, this.durations, ticket));
    } else if (assigneeChanged && nextStatus === 'assigned') {
      // Новому исполнителю — новый срок прибытия.
      Object.assign(data, timingUpdatesFor('assigned', now, this.durations, ticket));
    }
    if (assigneeChanged) {
      data.assigneeId = nextAssignee;
      if (nextAssignee) {
        data.assignedAt ??= ticket.assignedAt ?? now;
        data.acceptedAt ??= ticket.acceptedAt ?? now;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.ticket.update({ where: { id }, data });
      if (assigneeChanged && nextAssignee) {
        await tx.ticketAssignment.create({
          data: { ticketId: id, assigneeId: nextAssignee, assignedBy: user.id, assignedAt: now },
        });
      }
      return next;
    });
    this.logger.warn(
      `Заявка ${id} изменена (${user.email}): ${Object.keys(dto).join(', ') || 'без полей'}`,
    );

    if (statusChanged) {
      await this.publishStatusChange(ticket, updated, nextStatus, now, user);
    }
    // Исправление исполнителя в завершённой заявке — не новая работа, будить его незачем.
    if (assigneeChanged && nextAssignee && ACTIVE_STATUSES.includes(nextStatus)) {
      await this.publisher.publish(ROUTING_KEYS.TICKET_ASSIGNED, {
        ticketId: id,
        assigneeId: nextAssignee,
      });
    }
    return updated;
  }

  /**
   * Удаление заявки администратором (01.11.2026). Назначения, комментарии и отметки о
   * выполнении уходят каскадом. Смена графика сохраняет старый ticketId намеренно:
   * пустой ticketId генерация смен приняла бы за сбой и создала бы заявку заново.
   */
  async remove(id: string, user: AuthUser): Promise<void> {
    const ticket = await this.getTicketOrFail(id);
    await this.prisma.ticket.delete({ where: { id } });
    this.logger.warn(
      `Заявка ${id} удалена (${user.email}): ${ticket.type}/${ticket.status}, ` +
        `объект ${ticket.objectId}, автор ${ticket.createdBy}`,
    );
  }

  // ------------------------------------------------------- статусы и тайминги

  /** Смена статуса (М3.4): невалидный переход → 400 «Invalid status transition». */
  async changeStatus(id: string, dto: UpdateStatusDto, user: AuthUser): Promise<Ticket> {
    const ticket = await this.getTicketOrFail(id);
    return this.applyStatus(ticket, dto.status, new Date(), user);
  }

  /**
   * Служебный перевод в OVERDUE для сканера эскалации (М3.5).
   * Возвращает null, если заявку успели перевести в другой статус (гонка со сканером).
   */
  async markOverdue(ticketId: string, now = new Date()): Promise<Ticket | null> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || !canTransition(ticket.status, 'overdue')) {
      return null;
    }
    const minutesOverdue = this.minutesOverdue(ticket, now);
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'overdue',
        ...timingUpdatesFor('overdue', now, this.durations),
      },
    });
    this.logger.warn(
      `Заявка ${ticketId} просрочена (${ticket.status}): +${minutesOverdue} мин → overdue`,
    );
    const overduePayload: TicketOverduePayload = {
      ticketId,
      minutesOverdue,
      ...notificationTargets(updated),
    };
    await this.publisher.publish(ROUTING_KEYS.TICKET_OVERDUE, overduePayload);
    return updated;
  }

  /**
   * Эскалация «NEW не принята за ESCALATION_NEW_TO_ACCEPT_MIN» (М3.5).
   * Отдельного routing key для эскалации контракт 3.2 не предусматривает,
   * поэтому эскалация публикуется как ticket.overdue с числом минут просрочки.
   */
  async escalateUnaccepted(ticketId: string, now = new Date()): Promise<Ticket | null> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.status !== 'new' || ticket.escalatedAt) {
      return null;
    }
    const minutesOverdue = Math.max(
      this.minutesOverdue(ticket, now),
      this.durations.newToAcceptMin,
    );
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { escalatedAt: now, reactionDeadline: null },
    });
    this.logger.warn(
      `Эскалация заявки ${ticketId}: не принята за ${minutesOverdue} мин — уведомляем админа`,
    );
    const escalationPayload: TicketOverduePayload = {
      ticketId,
      minutesOverdue,
      // Исполнителя нет (NEW не принята) → assigneeId: null → notification-service
      // рассылает всем, то есть эскалация доходит и до админа/бригадира.
      ...notificationTargets(updated),
    };
    await this.publisher.publish(ROUTING_KEYS.TICKET_OVERDUE, escalationPayload);
    return updated;
  }

  // ------------------------------------------------------- назначение и работа

  /**
   * Назначение исполнителя (М3.4): пишет историю, эмитит ticket.assigned.
   * Повторное назначение на заявку в статусе assigned разрешено (смена исполнителя);
   * в остальных случаях действует state machine (new→assigned, rejected→assigned).
   */
  async assign(id: string, dto: AssignTicketDto, user: AuthUser): Promise<Ticket> {
    const ticket = await this.getTicketOrFail(id);
    if (ticket.status !== 'assigned' && !canTransition(ticket.status, 'assigned')) {
      throw new BadRequestException(INVALID_TRANSITION_MESSAGE);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.ticket.update({
        where: { id },
        data: {
          assigneeId: dto.assigneeId,
          status: 'assigned',
          assignedAt: now,
          acceptedAt: ticket.acceptedAt ?? now,
          reactionDeadline: null,
          arrivalDeadline: addMinutes(now, this.durations.acceptToArriveMin),
        },
      });
      await tx.ticketAssignment.create({
        data: {
          ticketId: id,
          assigneeId: dto.assigneeId,
          assignedBy: user.id,
          assignedAt: now,
        },
      });
      return next;
    });

    this.logger.log(`Заявка ${id} назначена на ${dto.assigneeId} (${user.email})`);
    await this.publisher.publish(ROUTING_KEYS.TICKET_ASSIGNED, {
      ticketId: id,
      assigneeId: dto.assigneeId,
    });
    return updated;
  }

  /** Комментарий к заявке (М3.4). */
  async addComment(id: string, dto: CreateCommentDto, user: AuthUser) {
    await this.getTicketOrFail(id);
    return this.prisma.ticketComment.create({
      data: { ticketId: id, authorId: user.id, text: dto.text },
    });
  }

  /**
   * Завершение операции техкарты (М3.6).
   *
   * Идемпотентность: уникальность (ticketId, operationId, roomId) в БД + проверка перед
   * записью. roomId входит в ключ — одна техкарта на несколько помещений маршрута.
   * Повторный вызов возвращает alreadyCompleted: true и НЕ публикует
   * ticket.operation.completed второй раз — material-service не спишет материалы дважды.
   */
  async completeOperation(
    ticketId: string,
    operationId: string,
    dto: CompleteOperationDto,
    user: AuthUser,
  ): Promise<CompleteOperationResult> {
    const ticket = await this.getTicketOrFail(ticketId);

    if (dto.requiresPhoto && !dto.photoUrl) {
      throw new BadRequestException('Для операции требуется фото (photoUrl)');
    }

    // "" вместо null: в Postgres NULL != NULL в уникальном индексе, и повтор
    // без roomId создал бы вторую запись.
    const roomId = dto.roomId?.trim() ?? '';

    const existing = await this.prisma.ticketOperationCompletion.findUnique({
      where: { ticketId_operationId_roomId: { ticketId, operationId, roomId } },
    });
    if (existing) {
      this.logger.log(
        `Операция ${operationId} (помещение ${roomId || '—'}) заявки ${ticketId} уже завершена — повтор игнорируется`,
      );
      return this.operationResult(ticket, existing, true);
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const operationsTotal = await this.resolveOperationsTotal(ticket, dto.totalOperations);

    let created;
    try {
      created = await this.prisma.ticketOperationCompletion.create({
        data: {
          ticketId,
          operationId,
          roomId,
          completedAt,
          photoUrl: dto.photoUrl ?? null,
          completedBy: user.id,
        },
      });
    } catch (error) {
      // Гонка двух одновременных вызовов: уникальный индекс отдаёт P2002.
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.ticketOperationCompletion.findUnique({
          where: { ticketId_operationId_roomId: { ticketId, operationId, roomId } },
        });
        if (raced) {
          return this.operationResult(ticket, raced, true);
        }
      }
      throw error;
    }

    // Контракт 3.2: operationId, ticketId, objectId, completedAt.
    await this.publisher.publish(ROUTING_KEYS.TICKET_OPERATION_COMPLETED, {
      operationId,
      ticketId,
      objectId: ticket.objectId,
      completedAt: created.completedAt.toISOString(),
    });

    const result = await this.operationResult(ticket, created, false, operationsTotal);

    // Факт работы по заявке двигает её статус сам (09.10.2026): оператор в вебе
    // отмечает операции, а не жмёт «в работу»/«выполнено», и без этого заявка
    // оставалась assigned → overdue, а доска действий не видела «в работе».
    // Заявка на одно помещение (roomId задан) закрывается последней операцией;
    // маршрутная — последним помещением (completeRoom), т.к. operationsTotal
    // запоминается по первому помещению и не покрывает весь маршрут.
    const inProgress = await this.autoTransition(ticket, 'in_progress', completedAt, user);
    if (ticket.roomId !== null && result.allOperationsCompleted) {
      await this.autoTransition(inProgress, 'completed', completedAt, user);
    }

    return result;
  }

  /**
   * Завершение помещения маршрута по заявке (пробел API М6.4).
   *
   * До этого отметка жила только в мобильном приложении. Идемпотентно по
   * (ticketId, roomId): повторный вызов возвращает alreadyCompleted: true.
   */
  async completeRoom(
    ticketId: string,
    roomId: string,
    dto: CompleteRoomDto,
    user: AuthUser,
  ): Promise<CompleteRoomResult> {
    const ticket = await this.getTicketOrFail(ticketId);
    const roomKey = roomId.trim();
    if (!roomKey) {
      throw new BadRequestException('roomId помещения обязателен');
    }

    const existing = await this.prisma.ticketRoomCompletion.findUnique({
      where: { ticketId_roomId: { ticketId, roomId: roomKey } },
    });
    if (existing) {
      this.logger.log(
        `Помещение ${roomKey} заявки ${ticketId} уже завершено — повтор игнорируется`,
      );
      return this.roomResult(ticket, existing, true);
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const roomsTotal = await this.resolveRoomsTotal(ticket, dto.totalRooms);

    let created;
    try {
      created = await this.prisma.ticketRoomCompletion.create({
        data: {
          ticketId,
          roomId: roomKey,
          completedAt,
          completedBy: user.id,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.ticketRoomCompletion.findUnique({
          where: { ticketId_roomId: { ticketId, roomId: roomKey } },
        });
        if (raced) {
          return this.roomResult(ticket, raced, true);
        }
      }
      throw error;
    }

    const result = await this.roomResult(ticket, created, false, roomsTotal);

    // Помещение без операций (нет техкарты) тоже означает начало работы;
    // последнее помещение маршрута завершает заявку.
    const inProgress = await this.autoTransition(ticket, 'in_progress', completedAt, user);
    if (result.allRoomsCompleted) {
      await this.autoTransition(inProgress, 'completed', completedAt, user);
    }

    return result;
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Переход статуса по факту работы оператора. Недопустимый по state machine
   * переход (например, new → in_progress у неназначенной заявки или повтор
   * in_progress → in_progress) молча пропускается: это побочный эффект, а не
   * действие пользователя, и 400 здесь сломал бы отметку операции.
   */
  private async autoTransition(
    ticket: Ticket,
    to: TicketStatus,
    now: Date,
    actor: AuthUser,
  ): Promise<Ticket> {
    if (ticket.status === to || !canTransition(ticket.status, to)) {
      return ticket;
    }
    return this.applyStatus(ticket, to, now, actor);
  }

  private async applyStatus(
    ticket: Ticket,
    to: TicketStatus,
    now: Date,
    actor: AuthUser | null,
  ): Promise<Ticket> {
    if (!canTransition(ticket.status, to)) {
      throw new BadRequestException(INVALID_TRANSITION_MESSAGE);
    }
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: to,
        ...timingUpdatesFor(to, now, this.durations, {
          acceptedAt: ticket.acceptedAt,
          arrivedAt: ticket.arrivedAt,
          plannedEnd: ticket.plannedEnd,
        }),
      },
    });
    this.logger.log(
      `Заявка ${ticket.id}: ${ticket.status} → ${to} (${actor?.email ?? 'система'})`,
    );
    await this.publishStatusChange(ticket, updated, to, now, actor);
    return updated;
  }

  private async publishStatusChange(
    before: Ticket,
    updated: Ticket,
    to: TicketStatus,
    now: Date,
    actor: AuthUser | null,
  ): Promise<void> {
    if (to === 'overdue') {
      const overduePayload: TicketOverduePayload = {
        ticketId: before.id,
        minutesOverdue: this.minutesOverdue(before, now),
        ...notificationTargets(updated),
      };
      await this.publisher.publish(ROUTING_KEYS.TICKET_OVERDUE, overduePayload);
      return;
    }

    // Остальные переходы — событие для бригадира/админа/автора заявки (09.10.2026).
    await this.publisher.publish(
      ROUTING_KEYS.TICKET_STATUS_CHANGED,
      statusChangedPayload(updated, to, before.status, actor, now),
    );
  }

  /** Минут просрочки по дедлайну, актуальному для текущего статуса заявки. */
  private minutesOverdue(ticket: Ticket, now: Date): number {
    const deadline =
      ticket.status === 'assigned'
        ? ticket.arrivalDeadline
        : ticket.status === 'in_progress' || ticket.status === 'paused'
          ? ticket.completionDeadline
          : ticket.reactionDeadline;
    return deadline ? minutesBetween(deadline, now) : 0;
  }

  /** Запоминает ожидаемое число операций заявки (первое переданное значение). */
  private async resolveOperationsTotal(
    ticket: Ticket,
    totalFromRequest?: number,
  ): Promise<number | null> {
    if (totalFromRequest === undefined || ticket.operationsTotal === totalFromRequest) {
      return ticket.operationsTotal;
    }
    if (ticket.operationsTotal !== null) {
      return ticket.operationsTotal;
    }
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { operationsTotal: totalFromRequest },
    });
    return totalFromRequest;
  }

  /** Запоминает ожидаемое число помещений заявки (первое переданное значение). */
  private async resolveRoomsTotal(
    ticket: Ticket,
    totalFromRequest?: number,
  ): Promise<number | null> {
    if (totalFromRequest === undefined || ticket.roomsTotal === totalFromRequest) {
      return ticket.roomsTotal;
    }
    if (ticket.roomsTotal !== null) {
      return ticket.roomsTotal;
    }
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { roomsTotal: totalFromRequest },
    });
    return totalFromRequest;
  }

  private async operationResult(
    ticket: Ticket,
    completion: {
      operationId: string;
      roomId?: string;
      completedAt: Date;
      photoUrl: string | null;
    },
    alreadyCompleted: boolean,
    operationsTotalOverride?: number | null,
  ): Promise<CompleteOperationResult> {
    const completedOperations = await this.prisma.ticketOperationCompletion.count({
      where: { ticketId: ticket.id },
    });
    const operationsTotal =
      operationsTotalOverride !== undefined ? operationsTotalOverride : ticket.operationsTotal;
    const allOperationsCompleted =
      operationsTotal !== null && operationsTotal > 0 && completedOperations >= operationsTotal;

    if (allOperationsCompleted && !alreadyCompleted) {
      this.logger.log(
        `Заявка ${ticket.id}: завершены все операции техкарты (${completedOperations}/${operationsTotal})`,
      );
    }

    return {
      ticketId: ticket.id,
      operationId: completion.operationId,
      roomId: completion.roomId ?? '',
      objectId: ticket.objectId,
      completedAt: completion.completedAt.toISOString(),
      photoUrl: completion.photoUrl,
      alreadyCompleted,
      completedOperations,
      operationsTotal,
      allOperationsCompleted,
    };
  }

  private async roomResult(
    ticket: Ticket,
    completion: { roomId: string; completedAt: Date },
    alreadyCompleted: boolean,
    roomsTotalOverride?: number | null,
  ): Promise<CompleteRoomResult> {
    const completedRooms = await this.prisma.ticketRoomCompletion.count({
      where: { ticketId: ticket.id },
    });
    const roomsTotal = roomsTotalOverride !== undefined ? roomsTotalOverride : ticket.roomsTotal;
    const allRoomsCompleted = roomsTotal !== null && roomsTotal > 0 && completedRooms >= roomsTotal;

    if (allRoomsCompleted && !alreadyCompleted) {
      this.logger.log(
        `Заявка ${ticket.id}: завершены все помещения маршрута (${completedRooms}/${roomsTotal})`,
      );
    }

    return {
      ticketId: ticket.id,
      roomId: completion.roomId,
      completedAt: completion.completedAt.toISOString(),
      alreadyCompleted,
      completedRooms,
      roomsTotal,
      allRoomsCompleted,
    };
  }
}

/** Статусы, в которых по заявке ещё идёт работа. */
const ACTIVE_STATUSES: readonly TicketStatus[] = ['assigned', 'in_progress', 'paused', 'overdue'];

/** Статус, который следует из смены исполнителя, если явно другой не задан. */
function impliedStatus(current: TicketStatus, assigneeId: string | null): TicketStatus {
  if (current === 'new' && assigneeId) return 'assigned';
  if (current === 'assigned' && !assigneeId) return 'new';
  return current;
}

/** Новая заявка без исполнителя, а заявка в работе — с ним; иначе 400. */
function assertStatusFitsAssignee(status: TicketStatus, assigneeId: string | null): void {
  if (status === 'new' && assigneeId) {
    throw new BadRequestException('У новой заявки не должно быть исполнителя');
  }
  if (!assigneeId && (status === 'assigned' || status === 'in_progress' || status === 'paused')) {
    throw new BadRequestException('Для этого статуса укажите исполнителя');
  }
}

/** Нарушение уникальности Prisma (P2002) — признак гонки идемпотентных вызовов. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Окно смены из входа: оба края или ни одного, конец позже начала; иначе 400. */
function plannedWindowOf(input: CreateTicketInput): { start: Date; end: Date } | null {
  if (!input.plannedStart && !input.plannedEnd) {
    return null;
  }
  if (!input.plannedStart || !input.plannedEnd) {
    throw new BadRequestException('Укажите начало и конец смены вместе');
  }
  const start = new Date(input.plannedStart);
  const end = new Date(input.plannedEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Некорректное окно смены');
  }
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException('Конец смены должен быть позже начала');
  }
  return { start, end };
}
