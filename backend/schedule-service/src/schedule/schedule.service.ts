import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScheduleEventStatus,
  type Prisma,
  type Schedule,
  type ScheduleEvent,
} from '@prisma/client';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
// Контракт статуса для ответов API берём из shared-словаря (то же значение видит
// админка). Запросы и записи в БД остаются на enum `@prisma/client` — его тип
// требует Prisma Client. При этом `toView` ниже присваивает статус Prisma в поле
// shared-типа, поэтому лишнее значение, появившееся только в схеме, ломает сборку,
// а расхождение в обратную сторону ловит `schedule-dictionary.spec.ts`.
import type { ScheduleEventStatus as ApiScheduleEventStatus } from '@cleaning-ops/shared/types/schedule';
import {
  ExternalServiceUnavailableException,
  geofenceUnavailable,
  ticketServiceUnavailable,
} from '../common/external-service.exception';
import type { RecurrenceRule, ScheduleMissedCheckinPayload } from '../events/event-payloads';
import { EventsPublisher } from '../events/events.publisher';
import { CoreClient } from '../core/core.client';
import { GpsClient } from '../gps/gps.client';
import { TicketClient, TicketCreationError } from '../tickets/ticket.client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CheckInDto,
  CheckOutDto,
  CreateScheduleDto,
  ListEventsQueryDto,
  MyEventsQueryDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import {
  formatDateOnly,
  matchesRecurrence,
  normalizeRecurrence,
  parseDateOnly,
  plannedStartAt,
  todayUtc,
} from './recurrence';

/** Тексты ошибок зафиксированы в задании М4.5 — их проверяет e2e. */
export const OUTSIDE_GEOFENCE_MESSAGE = 'Вы находитесь вне зоны объекта';

export const AUTO_CHECKOUT_REASON =
  'Автоматический check-out: оператор не закрыл смену в отведённое время';

/** Одна смена + имя графика: ответ /events и /my (мобильному нужен заголовок). */
export interface ScheduleEventView {
  id: string;
  scheduleId: string;
  scheduleName: string;
  objectId: string | null;
  routeId: string | null;
  date: string;
  plannedStart: string;
  /** Плановый конец смены (plannedStart + durationMin). UI: «окончание» — план. */
  plannedEnd: string;
  /** Статус смены: shared-словарь (админка и мобильное приложение — те же значения). */
  status: ApiScheduleEventStatus;
  userId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  ticketId: string | null;
  checkOutReason: string | null;
}

/** Итог генерации смен на дату (используется cron-ом, /generate и тестами). */
export interface GenerationResult {
  date: string;
  /** Сколько графиков подошло по правилу повторения. */
  schedulesMatched: number;
  /** Сколько смен создано в этом проходе. */
  shiftsCreated: number;
  /** Сколько смен уже было (идемпотентность по @@unique(scheduleId, date, userId)). */
  shiftsSkipped: number;
  /** Сколько заявок создано в этом проходе. */
  ticketsCreated: number;
  /** Сколько смен осталось без заявки — ticket-service недоступен. */
  ticketsFailed: number;
  /** Смены, которым заявка до-создана в этом проходе (после прошлого сбоя). */
  ticketsBackfilled: number;
  /** true — ticket-service был недоступен, проход прерван до записи смен. */
  ticketServiceUnavailable: boolean;
  errors: string[];
}

/** Итог прохода проверки неявок (М4.5). */
export interface MissedScanResult {
  scanned: number;
  missed: number;
  eventIds: string[];
}

/** Итог прохода авто check-out (М4.5). */
export interface AutoCheckoutResult {
  closed: number;
  eventIds: string[];
}

/**
 * Область ручного прохода (задача A2): конкретный график или конкретная смена.
 *
 * Зачем: ручные триггеры /generate и /check-missed работают на общем стенде, где
 * параллельно идут чужие прогоны. Без ограничения проход задевает ВСЕ смены, и
 * e2e-прогон одного теста ломает данные другого. Пустой объект = прежнее поведение.
 */
export interface SweepScope {
  /** Ограничить проход сменами одного графика. */
  scheduleId?: string;
  /**
   * Обработать ровно одну смену. Приоритетнее scheduleId (и date в checkMissed):
   * явный адрес смены не должен «гаситься» остальными фильтрами.
   */
  eventId?: string;
}

export interface DeleteScheduleResult {
  id: string;
  deleted: true;
  /** Сколько смен удалено каскадом вместе с графиком. */
  eventsDeleted: number;
}

/**
 * Графики, смены, check-in/check-out, автосоздание заявок (М4.4–М4.5).
 *
 * Ключевые решения:
 *  - даты и время трактуются в UTC (см. recurrence.ts);
 *  - идемпотентность генерации обеспечивается уникальным индексом
 *    @@unique(scheduleId, date, userId) плюс предварительным поиском существующих смен:
 *    повторный запуск /generate не плодит ни смен, ни заявок;
 *  - заявка создаётся сразу после смены; если ticket-service отказал, смена остаётся
 *    с ticketId=null и следующая генерация на ту же дату до-создаёт заявку (backfill);
 *  - недоступность gps-service при check-in — 502, вне зоны — 403, «сервис вернул
 *    неожиданный ответ» — тоже 502: подтверждение геозоны не должно превращаться в 500.
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketClient,
    private readonly gps: GpsClient,
    private readonly core: CoreClient,
    private readonly publisher: EventsPublisher,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ графики

  async create(dto: CreateScheduleDto): Promise<Schedule> {
    const recurrence = this.assertRecurrence(dto.recurrence);
    const assignees = uniqueAssignees(dto.assignees);
    return this.prisma.schedule.create({
      data: {
        objectId: dto.objectId ?? null,
        routeId: dto.routeId ?? null,
        name: dto.name,
        recurrence: recurrence as unknown as Prisma.InputJsonValue,
        assignees,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(): Promise<Array<Schedule & { eventsCount: number }>> {
    const schedules = await this.prisma.schedule.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { events: true } } },
    });
    return schedules.map(({ _count, ...schedule }) => ({
      ...schedule,
      eventsCount: _count.events,
    }));
  }

  async getById(id: string): Promise<Schedule> {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('График не найден');
    }
    return schedule;
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    await this.getById(id);
    const data: Prisma.ScheduleUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.objectId !== undefined) {
      data.objectId = dto.objectId;
    }
    if (dto.routeId !== undefined) {
      data.routeId = dto.routeId;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.assignees !== undefined) {
      data.assignees = uniqueAssignees(dto.assignees);
    }
    if (dto.recurrence !== undefined) {
      data.recurrence = this.assertRecurrence(dto.recurrence) as unknown as Prisma.InputJsonValue;
    }
    return this.prisma.schedule.update({ where: { id }, data });
  }

  async remove(id: string): Promise<DeleteScheduleResult> {
    await this.getById(id);
    // Смены удаляются каскадом (onDelete: Cascade в схеме), поэтому считаем заранее.
    const eventsDeleted = await this.prisma.scheduleEvent.count({ where: { scheduleId: id } });
    await this.prisma.schedule.delete({ where: { id } });
    return { id, deleted: true, eventsDeleted };
  }

  // -------------------------------------------------------------------- смены

  /** GET /api/schedule/events?date=&objectId=&userId= (дата по умолчанию — сегодня UTC). */
  async listEvents(query: ListEventsQueryDto): Promise<ScheduleEventView[]> {
    const date = query.date ? this.parseDate(query.date) : todayUtc();
    const events = await this.prisma.scheduleEvent.findMany({
      where: {
        date,
        ...(query.objectId ? { schedule: { objectId: query.objectId } } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      },
      include: { schedule: true },
      orderBy: [{ plannedStart: 'asc' }, { id: 'asc' }],
    });
    return events.map(toView);
  }

  /** GET /api/schedule/my — смены текущего пользователя (по умолчанию — сегодня). */
  async listMyEvents(userId: string, query: MyEventsQueryDto): Promise<ScheduleEventView[]> {
    const from = query.from ? this.parseDate(query.from) : todayUtc();
    // to включительно: конец периода — конец указанного дня.
    const to = query.to ? new Date(this.parseDate(query.to).getTime() + 24 * 60 * 60 * 1000) : null;
    const events = await this.prisma.scheduleEvent.findMany({
      where: {
        userId,
        date: { gte: from, ...(to ? { lt: to } : {}) },
      },
      include: { schedule: true },
      orderBy: [{ plannedStart: 'asc' }, { id: 'asc' }],
    });
    return events.map(toView);
  }

  /** Одна смена по id (для админки/отладки). */
  async getEvent(id: string): Promise<ScheduleEventView> {
    const event = await this.prisma.scheduleEvent.findUnique({
      where: { id },
      include: { schedule: true },
    });
    if (!event) {
      throw new NotFoundException('Смена не найдена');
    }
    return toView(event);
  }

  // --------------------------------------------------------------- генерация

  /**
   * Детерминированный триггер М4.4 (cron и POST /generate): смены на дату по активным
   * графикам + плановые заявки в ticket-service.
   *
   * Плановая заявка создаётся сразу для смены с исполнителем. Ответ 502 отдаётся только
   * если ticket-service недоступен ДО записи смен: иначе смысл генерации теряется
   * (смены без заявок), а состояние остаётся консистентным — повторный вызов до-создаст
   * заявки. Сбой по отдельной смене не прерывает проход: error попадает в errors[].
   *
   * `scope.scheduleId` ограничивает проход одним графиком (задача A2). Несуществующий
   * график — 404, а не «успех с нулями»: иначе опечатка в id выглядела бы как
   * выполненная генерация. Фильтр `isActive` сохраняется: выключенный график
   * смен не порождает даже при явном запросе.
   */
  async generateForDate(
    dateValue?: string,
    now: Date = new Date(),
    scope: SweepScope = {},
  ): Promise<GenerationResult> {
    const date = dateValue ? this.parseDate(dateValue) : todayUtc(now);
    const result: GenerationResult = {
      date: formatDateOnly(date),
      schedulesMatched: 0,
      shiftsCreated: 0,
      shiftsSkipped: 0,
      ticketsCreated: 0,
      ticketsFailed: 0,
      ticketsBackfilled: 0,
      ticketServiceUnavailable: false,
      errors: [],
    };

    if (scope.scheduleId) {
      await this.assertScheduleExists(scope.scheduleId);
    }

    const schedules = await this.prisma.schedule.findMany({
      where: { isActive: true, ...(scope.scheduleId ? { id: scope.scheduleId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    const matching = schedules.filter((schedule) =>
      this.matchesDate(schedule, date, result.errors),
    );
    result.schedulesMatched = matching.length;
    if (matching.length === 0) {
      return result;
    }

    // До записи смен убеждаемся, что заявки вообще могут быть созданы: иначе получились
    // бы смены без плановых заявок, а «М4.4 без заявки» не имеет смысла.
    if (!(await this.tickets.isAvailable())) {
      result.ticketServiceUnavailable = true;
      this.logger.error(`Генерация на ${result.date}: ticket-service недоступен, проход прерван`);
      throw ticketServiceUnavailable();
    }

    for (const schedule of matching) {
      await this.generateForSchedule(schedule, date, result);
    }

    this.logger.log(
      `Генерация на ${result.date}: графиков ${result.schedulesMatched}, смен ${result.shiftsCreated} ` +
        `(пропущено ${result.shiftsSkipped}), заявок ${result.ticketsCreated} ` +
        `(до-создано ${result.ticketsBackfilled}, ошибок ${result.ticketsFailed})`,
    );
    return result;
  }

  private async generateForSchedule(
    schedule: Schedule,
    date: Date,
    result: GenerationResult,
  ): Promise<void> {
    const recurrence = normalizeRecurrence(schedule.recurrence);
    if (!recurrence) {
      return;
    }
    const plannedStart = plannedStartAt(date, recurrence.time);
    const plannedEnd = new Date(plannedStart.getTime() + this.shiftPlannedDurationMs(recurrence));
    const assignees = schedule.assignees.length > 0 ? schedule.assignees : [null];

    for (const assignee of assignees) {
      const existing = await this.prisma.scheduleEvent.findFirst({
        where: { scheduleId: schedule.id, date, userId: assignee },
      });
      if (existing) {
        result.shiftsSkipped += 1;
        if (!existing.ticketId && schedule.objectId && assignee) {
          // Прошлый проход не смог создать заявку (ticket-service лежал) — до-создаём.
          await this.attachTicket(existing, schedule, result, true);
        }
        continue;
      }

      const created = await this.prisma.scheduleEvent.create({
        data: {
          scheduleId: schedule.id,
          date,
          plannedStart,
          plannedEnd,
          status: ScheduleEventStatus.PLANNED,
          userId: assignee,
        },
      });
      result.shiftsCreated += 1;
      this.logger.log(
        `Смена ${created.id}: график «${schedule.name}» на ${formatDateOnly(date)} ` +
          `(${assignee ?? 'без исполнителя'}), начало ${plannedStart.toISOString()}`,
      );

      if (created.ticketId || !schedule.objectId || !assignee) {
        continue;
      }
      await this.attachTicket(created, schedule, result, false);
    }
  }

  /**
   * Создаёт плановую заявку и привязывает её к смене (ticketId).
   * `backfill` — заявка до-создаётся для уже существовавшей смены (прошлый сбой).
   */
  private async attachTicket(
    event: ScheduleEvent,
    schedule: Schedule,
    result: GenerationResult,
    backfill: boolean,
  ): Promise<void> {
    if (!schedule.objectId || !event.userId) {
      return;
    }
    try {
      const ticket = await this.tickets.createTicket({
        type: 'planned',
        priority: 'normal',
        objectId: schedule.objectId,
        assigneeId: event.userId,
        description: this.ticketDescription(schedule, event.plannedStart),
      });
      await this.prisma.scheduleEvent.update({
        where: { id: event.id },
        data: { ticketId: ticket.id },
      });
      if (backfill) {
        result.ticketsBackfilled += 1;
      } else {
        result.ticketsCreated += 1;
      }
      this.logger.log(`Смена ${event.id} → плановая заявка ${ticket.id}`);
    } catch (error) {
      result.ticketsFailed += 1;
      const message =
        error instanceof TicketCreationError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      result.errors.push(`Смена ${event.id}: заявка не создана (${message})`);
      this.logger.warn(
        `Смена ${event.id}: плановая заявка не создана (${message}). ` +
          'Смена сохранена без ticketId — следующая генерация до-создаст заявку.',
      );
    }
  }

  private ticketDescription(schedule: Schedule, plannedStart: Date): string {
    const time = plannedStart.toISOString().slice(0, 16).replace('T', ' ');
    return `Плановая уборка по графику «${schedule.name}» на ${time} UTC`;
  }

  /**
   * Регулярная генерация (cron): смены на сегодня, если текущий час UTC — настроенный.
   * Ошибка прохода не пробрасывается в таймер: следующий проход повторит попытку.
   */
  async generateForCurrentHour(now: Date = new Date()): Promise<GenerationResult | null> {
    const hour = this.config.get<number>('schedule.generateHourUtc') ?? 0;
    if (now.getUTCHours() !== hour) {
      return null;
    }
    try {
      return await this.generateForDate(formatDateOnly(now), now);
    } catch (error) {
      this.logger.error(
        `Регулярная генерация на ${formatDateOnly(now)} завершилась ошибкой: ${describe(error)}`,
      );
      return null;
    }
  }

  // -------------------------------------------------------------- check-in/out

  /**
   * POST /api/schedule/check-in: проверка геозоны → CHECKED_IN.
   *
   * Идемпотентность: повторный check-in той же смены возвращает уже сохранённую отметку
   * и не обращается к gps-service (иначе потеря сети превращала бы повтор в 502).
   */
  async checkIn(
    userId: string,
    dto: CheckInDto,
    token?: string,
    now: Date = new Date(),
  ): Promise<ScheduleEventView> {
    const event = await this.findTodayEvent(dto.scheduleId, userId, now);
    if (event.checkInAt) {
      this.logger.log(`Повторный check-in смены ${event.id}: отметка уже есть (идемпотентно)`);
      return this.viewOf(event);
    }
    if (event.status === ScheduleEventStatus.CHECKED_OUT || event.checkOutAt) {
      throw new ConflictException('Смена уже закрыта');
    }

    const geofence = await this.confirmGeofence(userId, dto.lat, dto.lng, token);
    if (!geofence.inside) {
      // Вне зоны: 403 с текстом из задания. Отметка не ставится.
      throw new ForbiddenException(OUTSIDE_GEOFENCE_MESSAGE);
    }

    const updated = await this.prisma.scheduleEvent.update({
      where: { id: event.id },
      data: {
        status: ScheduleEventStatus.CHECKED_IN,
        checkInAt: now,
        checkInLat: dto.lat,
        checkInLng: dto.lng,
      },
      include: { schedule: true },
    });
    this.logger.log(
      `Check-in смены ${updated.id} (график ${updated.scheduleId}), внутри геозоны` +
        (geofence.geofence ? ` «${geofence.geofence.name}»` : ''),
    );
    return toView(updated);
  }

  /** POST /api/schedule/check-out: закрывает смену, время и (опционально) координаты. */
  async checkOut(
    userId: string,
    dto: CheckOutDto,
    now: Date = new Date(),
  ): Promise<ScheduleEventView> {
    const event = await this.findTodayEvent(dto.scheduleId, userId, now);

    if (event.checkOutAt || event.status === ScheduleEventStatus.CHECKED_OUT) {
      // Идемпотентность: повторное закрытие не перезаписывает время и не плодит событий.
      this.logger.log(`Повторный check-out смены ${event.id}: смена уже закрыта`);
      return this.viewOf(event);
    }
    if (!event.checkInAt) {
      throw new BadRequestException('Смена не открыта: сначала выполните check-in');
    }

    const updated = await this.prisma.scheduleEvent.update({
      where: { id: event.id },
      data: {
        status: ScheduleEventStatus.CHECKED_OUT,
        checkOutAt: now,
        checkOutLat: dto.lat ?? null,
        checkOutLng: dto.lng ?? null,
      },
      include: { schedule: true },
    });
    this.logger.log(
      `Check-out смены ${updated.id}: длительность ` +
        `${Math.round((now.getTime() - (event.checkInAt?.getTime() ?? now.getTime())) / 60_000)} мин`,
    );
    return toView(updated);
  }

  // ------------------------------------------------------- неявки и авто check-out

  /**
   * Проверка неявок (М4.5): смена PLANNED, у которой plannedStart прошёл, а check-in
   * не сделан → MISSED + событие schedule.missed_checkin.
   *
   * Один проход = один переход статуса. Повторный проход видит MISSED и события не
   * публикует — это и есть защита от дублей (таймер срабатывания не нужен).
   *
   * `scope` (задача A2) ограничивает проход одним графиком или одной сменой; условие
   * «время начала прошло» при этом сохраняется — ограничение сужает выборку, а не
   * форсирует переход незрелой смены в MISSED.
   */
  async checkMissed(
    dateValue?: string,
    now: Date = new Date(),
    scope: SweepScope = {},
  ): Promise<MissedScanResult> {
    await this.assertScopeExists(scope);
    return this.runCheckMissed(dateValue, now, scope);
  }

  private async runCheckMissed(
    dateValue: string | undefined,
    now: Date,
    scope: SweepScope,
  ): Promise<MissedScanResult> {
    const dateFilter = dateValue ? this.parseDate(dateValue) : null;
    const batchSize = this.config.get<number>('schedule.batchSize') ?? 200;

    const candidates = await this.prisma.scheduleEvent.findMany({
      where: {
        status: ScheduleEventStatus.PLANNED,
        checkInAt: null,
        plannedStart: { lte: now },
        // Смены без исполнителя не «неявка»: отметиться некому.
        userId: { not: null },
        // При eventId дата игнорируется: смена адресована точно, а лишний фильтр
        // мог бы «погасить» её и вернуть нули вместо обработки.
        ...(dateFilter && !scope.eventId ? { date: dateFilter } : {}),
        ...this.scopeWhere(scope),
      },
      include: { schedule: true },
      orderBy: { plannedStart: 'asc' },
      take: batchSize,
    });

    const eventIds: string[] = [];
    for (const event of candidates) {
      const updated = await this.prisma.scheduleEvent.updateMany({
        where: { id: event.id, status: ScheduleEventStatus.PLANNED, checkInAt: null },
        data: { status: ScheduleEventStatus.MISSED },
      });
      if (updated.count === 0) {
        // Смену отметили или отменили между выборкой и обновлением — не наша неявка.
        continue;
      }
      eventIds.push(event.id);
      await this.publishMissed(event, now);
    }

    if (eventIds.length > 0 || candidates.length > 0) {
      this.logger.warn(`Неявки: зафиксировано ${eventIds.length} из ${candidates.length} проверенных`);
    }
    return { scanned: candidates.length, missed: eventIds.length, eventIds };
  }

  /**
   * Авто check-out (М4.5): смена CHECKED_IN, у которой с plannedStart прошло больше
   * SCHEDULE_AUTO_CHECKOUT_MINUTES → CHECKED_OUT с пометкой причины.
   *
   * `scope` (задача A2) ограничивает проход одним графиком или одной сменой; порог
   * времени сохраняется по тем же причинам, что и в checkMissed.
   */
  async autoCheckout(now: Date = new Date(), scope: SweepScope = {}): Promise<AutoCheckoutResult> {
    await this.assertScopeExists(scope);
    return this.runAutoCheckout(now, scope);
  }

  private async runAutoCheckout(now: Date, scope: SweepScope): Promise<AutoCheckoutResult> {
    const minutes = this.config.get<number>('schedule.autoCheckoutMinutes') ?? 15;
    const threshold = new Date(now.getTime() - minutes * 60_000);
    const batchSize = this.config.get<number>('schedule.batchSize') ?? 200;

    const candidates = await this.prisma.scheduleEvent.findMany({
      where: {
        status: ScheduleEventStatus.CHECKED_IN,
        checkOutAt: null,
        plannedStart: { lte: threshold },
        ...this.scopeWhere(scope),
      },
      include: { schedule: true },
      orderBy: { plannedStart: 'asc' },
      take: batchSize,
    });

    const eventIds: string[] = [];
    for (const event of candidates) {
      const end = new Date(event.plannedStart.getTime() + this.shiftDurationMs());
      // Отсчёт от планового начала (см. configuration.ts): длительность модели не задана.
      await this.prisma.scheduleEvent.update({
        where: { id: event.id },
        data: {
          status: ScheduleEventStatus.CHECKED_OUT,
          checkOutAt: now,
          checkOutReason: AUTO_CHECKOUT_REASON,
        },
      });
      eventIds.push(event.id);
      this.logger.warn(
        `Авто check-out смены ${event.id}: оператор не закрыл смену ` +
          `(начало ${event.plannedStart.toISOString()}, конец по графику ${end.toISOString()})`,
      );
    }
    return { closed: eventIds.length, eventIds };
  }

  /** Один проход «проверка неявок + авто check-out» — вызывается таймером и /check-missed. */
  async scanMissedAndAutoCheckout(
    dateValue?: string,
    now: Date = new Date(),
    scope: SweepScope = {},
  ): Promise<{ missed: MissedScanResult; autoCheckout: AutoCheckoutResult }> {
    // Область проверяем здесь один раз, а не в обоих публичных методах: иначе один
    // ручной прогон делал бы два лишних запроса за существованием того же id.
    await this.assertScopeExists(scope);
    const autoCheckout = await this.runAutoCheckout(now, scope);
    const missed = await this.runCheckMissed(dateValue, now, scope);
    return { missed, autoCheckout };
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Проверка области ручного прохода: неизвестный график или смена → 404.
   *
   * Пустая область — сразу выход: cron-проход и вызовы без параметров не должны
   * ходить в БД за проверкой того, чего в запросе нет.
   */
  private async assertScopeExists(scope: SweepScope): Promise<void> {
    if (scope.eventId) {
      // Приоритет eventId (задача A2): scheduleId при явной смене не проверяем —
      // он не участвует в выборке и не должен влиять на результат.
      const event = await this.prisma.scheduleEvent.findUnique({ where: { id: scope.eventId } });
      if (!event) {
        throw new NotFoundException('Смена не найдена');
      }
      return;
    }
    if (scope.scheduleId) {
      await this.assertScheduleExists(scope.scheduleId);
    }
  }

  private async assertScheduleExists(scheduleId: string): Promise<void> {
    const schedule = await this.prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException('График не найден');
    }
  }

  /** Фильтр Prisma по области прохода: eventId приоритетнее scheduleId. */
  private scopeWhere(scope: SweepScope): Prisma.ScheduleEventWhereInput {
    if (scope.eventId) {
      return { id: scope.eventId };
    }
    if (scope.scheduleId) {
      return { scheduleId: scope.scheduleId };
    }
    return {};
  }

  /**
   * Длительность смены для авто check-out. В модели хранится только начало,
   * поэтому конец смены — начало + AUTO_MINUTES (конфиг = тот же таймаут бездействия).
   * Функция вынесена отдельно, чтобы правило было в одном месте и покрывалось тестом.
   */
  private shiftDurationMs(): number {
    const minutes = this.config.get<number>('schedule.autoCheckoutMinutes') ?? 15;
    return minutes * 60_000;
  }

  /**
   * Плановая длительность смены (plannedStart → plannedEnd).
   * Приоритет: recurrence.durationMin → schedule.defaultShiftMinutes (480).
   * Не путать с shiftDurationMs() — тот про таймаут бездействия авто check-out.
   */
  private shiftPlannedDurationMs(recurrence: RecurrenceRule): number {
    const minutes =
      recurrence.durationMin ??
      this.config.get<number>('schedule.defaultShiftMinutes') ??
      480;
    return minutes * 60_000;
  }

  /** Смена сегодняшнего дня по графику и исполнителю. */
  private async findTodayEvent(
    scheduleId: string,
    userId: string,
    now: Date,
  ): Promise<ScheduleEvent & { schedule: Schedule }> {
    const date = todayUtc(now);
    const event = await this.prisma.scheduleEvent.findFirst({
      where: { scheduleId, userId, date },
      include: { schedule: true },
    });
    if (!event) {
      const schedule = await this.prisma.schedule.findUnique({ where: { id: scheduleId } });
      if (!schedule) {
        throw new NotFoundException('График не найден');
      }
      throw new NotFoundException(
        `Смена на ${formatDateOnly(date)} по графику «${schedule.name}» для вас не найдена`,
      );
    }
    return event;
  }

  private async viewOf(event: ScheduleEvent & { schedule: Schedule }): Promise<ScheduleEventView> {
    const full =
      event.schedule ??
      (await this.prisma.schedule.findUnique({ where: { id: event.scheduleId } }));
    return toView({ ...event, schedule: full } as ScheduleEvent & { schedule: Schedule });
  }

  /** Проверка геозоны; недоступность gps-service → 502, а не 500. */
  private async confirmGeofence(
    userId: string,
    lat: number,
    lng: number,
    token?: string,
  ): Promise<{ inside: boolean; geofence: { name: string } | null }> {
    try {
      const result = await this.gps.checkGeofence(userId, lat, lng, token);
      return { inside: result.inside, geofence: result.geofence };
    } catch (error) {
      if (error instanceof ExternalServiceUnavailableException) {
        // 502 из GpsClient уже содержит нужный текст и статус — не подменяем на 503.
        throw error;
      }
      this.logger.error(
        `Проверка геозоны для ${userId} завершилась ошибкой: ${describe(error)}`,
      );
      throw geofenceUnavailable();
    }
  }

  /** Публикует schedule.missed_checkin; имя объекта берём из core-service (не критично). */
  private async publishMissed(
    event: ScheduleEvent & { schedule: Schedule },
    now: Date,
  ): Promise<void> {
    const objectId = event.schedule.objectId ?? '';
    let objectName = objectId;
    if (objectId) {
      const fetched = await this.core.getObjectName(objectId);
      if (fetched) {
        objectName = fetched;
      }
    }
    const payload: ScheduleMissedCheckinPayload = {
      userId: event.userId ?? '',
      scheduleId: event.scheduleId,
      objectName,
      eventId: event.id,
      objectId,
      plannedStart: event.plannedStart.toISOString(),
      detectedAt: now.toISOString(),
    };
    await this.publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, payload);
  }

  private matchesDate(schedule: Schedule, date: Date, errors: string[]): boolean {
    const recurrence = normalizeRecurrence(schedule.recurrence);
    if (!recurrence) {
      const message = `График ${schedule.id}: некорректное правило повторения — пропущен`;
      this.logger.warn(message);
      errors.push(message);
      return false;
    }
    return matchesRecurrence(recurrence, date);
  }

  /** "YYYY-MM-DD" → полночь UTC; невалидная строка → 400. */
  private parseDate(value: string): Date {
    try {
      return parseDateOnly(value);
    } catch {
      throw new BadRequestException('Дата должна быть в формате YYYY-MM-DD');
    }
  }

  /** Доменные проверки recurrence: weekly без days и monthly без числа месяца бессмысленны. */
  private assertRecurrence(rule: CreateScheduleDto['recurrence']): RecurrenceRule {
    const normalized = normalizeRecurrence(rule);
    if (!normalized) {
      throw new BadRequestException(
        'Некорректное правило повторения: нужны frequency и time "HH:mm"',
      );
    }
    if (normalized.frequency === 'weekly' && (!normalized.days || normalized.days.length === 0)) {
      throw new BadRequestException('Для weekly укажите days (1=Пн … 7=Вс)');
    }
    if (
      normalized.frequency === 'monthly' &&
      normalized.dayOfMonth === undefined &&
      (!normalized.days || normalized.days.length === 0)
    ) {
      throw new BadRequestException('Для monthly укажите dayOfMonth (1..31)');
    }
    return normalized;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uniqueAssignees(assignees: string[]): string[] {
  return [...new Set(assignees.map((item) => item.trim()).filter((item) => item !== ''))];
}

/** Prisma-модель события + график → плоское представление для API. */
function toView(event: ScheduleEvent & { schedule: Schedule }): ScheduleEventView {
  return {
    id: event.id,
    scheduleId: event.scheduleId,
    scheduleName: event.schedule.name,
    objectId: event.schedule.objectId,
    routeId: event.schedule.routeId,
    date: formatDateOnly(event.date),
    plannedStart: event.plannedStart.toISOString(),
    plannedEnd: event.plannedEnd.toISOString(),
    status: event.status,
    userId: event.userId,
    checkInAt: event.checkInAt ? event.checkInAt.toISOString() : null,
    checkOutAt: event.checkOutAt ? event.checkOutAt.toISOString() : null,
    checkInLat: event.checkInLat,
    checkInLng: event.checkInLng,
    checkOutLat: event.checkOutLat,
    checkOutLng: event.checkOutLng,
    ticketId: event.ticketId,
    checkOutReason: event.checkOutReason,
  };
}
