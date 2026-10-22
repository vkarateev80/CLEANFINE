import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MINUTE_MS } from './ticket-timings';
import { TicketsService } from './tickets.service';

/** Результат одного прохода сканера — используется в логах, тестах и e2e. */
export interface EscalationScanResult {
  /** true — предыдущий проход ещё не закончился, этот пропущен. */
  skipped: boolean;
  /** id заявок, по которым сработала эскалация «NEW не принята». */
  escalated: string[];
  /** id заявок, переведённых в OVERDUE (просрочка прибытия/выполнения). */
  overdue: string[];
  /** true — проход упал (БД недоступна); процесс сервиса при этом жив. */
  failed: boolean;
}

/** Ограничение выборки за один проход, чтобы не грузить БД и не копить задержку. */
const SCAN_BATCH = 200;

/**
 * Эскалация заявок (М3.5) периодическим сканированием БД.
 *
 * Почему сканирование, а не Bull/Redis-таймеры (решение и обоснование — в отчёте):
 *  - дедлайны и так материализованы в колонках заявки (reactionDeadline/arrivalDeadline/
 *    completionDeadline), поэтому отдельное хранилище таймеров дублировало бы состояние;
 *  - потеря Redis или перезапуск сервиса не теряет таймеры: следующий проход видит
 *    просроченные дедлайны в БД (Bull в этом случае требует ручного восстановления);
 *  - unit/e2e тесты не требуют Redis — сканирование вызывается напрямую с нужным `now`;
 *  - срабатывание ровно один раз обеспечивается не таймером, а данными: после эскалации
 *    ставится escalatedAt, после просрочки статус меняется на overdue и дедлайны гасятся.
 *
 * Гонка «сканер ↔ ручное действие пользователя» разрешается в TicketsService:
 * служебные методы проверяют актуальный статус и возвращают null, если переход уже невозможен.
 */
@Injectable()
export class EscalationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationService.name);
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('escalation.enabled') ?? true;
    if (!enabled) {
      this.logger.warn('Сканер эскалации отключён (TICKET_ESCALATION_ENABLED=false)');
      return;
    }
    const intervalMs = this.config.get<number>('escalation.intervalMs') ?? 30_000;
    this.timer = setInterval(() => {
      void this.scan();
    }, intervalMs);
    // Таймер не должен удерживать процесс при graceful shutdown.
    this.timer.unref?.();
    this.logger.log(`Сканер эскалации запущен: проход каждые ${intervalMs} мс`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Один проход: эскалация непринятых NEW и перевод просроченных в OVERDUE.
   * `now` — параметр для тестов (виртуальное время).
   */
  async scan(now: Date = new Date()): Promise<EscalationScanResult> {
    if (this.scanning) {
      this.logger.warn('Предыдущий проход сканера ещё не завершён — проход пропущен');
      return { skipped: true, escalated: [], overdue: [], failed: false };
    }
    this.scanning = true;
    try {
      const escalated = await this.escalateUnacceptedTickets(now);
      const overdue = await this.markOverdueTickets(now);
      return { skipped: false, escalated, overdue, failed: false };
    } catch (error) {
      // Падение сканера не должно ронять сервис: следующий проход повторит попытку.
      this.logger.error(
        `Проход сканера эскалации завершился ошибкой: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { skipped: false, escalated: [], overdue: [], failed: true };
    } finally {
      this.scanning = false;
    }
  }

  private async escalateUnacceptedTickets(now: Date): Promise<string[]> {
    const newToAcceptMin = this.config.get<number>('escalation.newToAcceptMin') ?? 5;
    const threshold = new Date(now.getTime() - newToAcceptMin * MINUTE_MS);

    const candidates = await this.prisma.ticket.findMany({
      where: { status: 'new', escalatedAt: null, createdAt: { lte: threshold } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: SCAN_BATCH,
    });

    const escalated: string[] = [];
    for (const candidate of candidates) {
      const updated = await this.tickets.escalateUnaccepted(candidate.id, now);
      if (updated) {
        escalated.push(candidate.id);
      }
    }
    return escalated;
  }

  private async markOverdueTickets(now: Date): Promise<string[]> {
    const [notArrived, notCompleted] = await Promise.all([
      this.prisma.ticket.findMany({
        // Не прибыл в срок — или заявка смены не начата к концу смены
        // (completionDeadline у неё стоит с создания, arrivalDeadline нет).
        where: {
          status: 'assigned',
          OR: [{ arrivalDeadline: { lte: now } }, { completionDeadline: { lte: now } }],
        },
        select: { id: true },
        take: SCAN_BATCH,
      }),
      this.prisma.ticket.findMany({
        where: { status: { in: ['in_progress', 'paused'] }, completionDeadline: { lte: now } },
        select: { id: true },
        take: SCAN_BATCH,
      }),
    ]);

    const overdue: string[] = [];
    for (const candidate of [...notArrived, ...notCompleted]) {
      const updated = await this.tickets.markOverdue(candidate.id, now);
      if (updated) {
        overdue.push(candidate.id);
      }
    }
    return overdue;
  }
}
