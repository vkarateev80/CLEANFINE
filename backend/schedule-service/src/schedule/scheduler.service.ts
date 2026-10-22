import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleService } from './schedule.service';

/** Отметка времени последнего прохода для наблюдаемости (логи/отладка). */
export interface SweepState {
  lastGenerateAt: string | null;
  lastScanAt: string | null;
  lastGenerateDate: string | null;
}

/**
 * Периодические проходы schedule-service (М4.4–М4.5).
 *
 * Почему setInterval, а не @nestjs/schedule (Bull/Cron):
 *  - оба прохода идемпотентны и опираются на данные в БД (уникальность смены,
 *    статус PLANNED→MISSED), поэтому отдельное хранилище таймеров не нужно;
 *  - перезапуск сервиса не теряет работу: следующий проход видит те же смены;
 *  - unit/e2e-тесты вызывают ScheduleService.scanMissedAndAutoCheckout() напрямую,
 *    без ожидания таймера (как эскалация в ticket-service).
 *
 * Два независимых таймера:
 *  - генерация смен (тик раз в час, смены создаёт тик настроенного часа по времени расписания);
 *  - проверка неявок + авто check-out (SCHEDULE_MISSED_CHECKIN_INTERVAL_MS).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  private generateTimer: NodeJS.Timeout | null = null;
  /** Задержка до первой границы интервала генерации (тик — ровно в :00). */
  private generateDelay: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private scanning = false;
  private generating = false;

  private readonly state: SweepState = {
    lastGenerateAt: null,
    lastScanAt: null,
    lastGenerateDate: null,
  };

  constructor(
    private readonly schedule: ScheduleService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('schedule.cronEnabled') ?? true;
    if (!enabled) {
      this.logger.warn('Периодические проходы отключены (SCHEDULE_CRON_ENABLED=false)');
      return;
    }

    const generateIntervalMs = this.config.get<number>('schedule.generateIntervalMs') ?? 3_600_000;
    const hour = this.config.get<number>('schedule.generateHour') ?? 0;
    const scanIntervalMs =
      this.config.get<number>('schedule.missedCheckinIntervalMs') ?? 5 * 60 * 1000;

    // Смены на сегодня — сразу, если час генерации уже прошёл (перезапуск в
    // 00:29 раньше оставлял день без смен до ручной генерации).
    void this.runCatchUp();

    // Тики по границе интервала (при часовом интервале — ровно в :00), а не от
    // момента старта пода: иначе генерация шла в 00:43 и зависела от выката.
    const firstDelay = generateIntervalMs - (Date.now() % generateIntervalMs);
    this.generateDelay = setTimeout(() => {
      this.generateDelay = null;
      void this.runGenerate();
      this.generateTimer = setInterval(() => {
        void this.runGenerate();
      }, generateIntervalMs);
      this.generateTimer.unref?.();
    }, firstDelay);
    this.generateDelay.unref?.();

    this.scanTimer = setInterval(() => {
      void this.runScan();
    }, scanIntervalMs);
    this.scanTimer.unref?.();

    this.logger.log(
      `Периодические проходы запущены: генерация смен каждые ${generateIntervalMs} мс ` +
        `(смены — в ${hour}:00 по времени расписания), проверка неявок/авто check-out каждые ${scanIntervalMs} мс`,
    );
  }

  onModuleDestroy(): void {
    if (this.generateDelay) {
      clearTimeout(this.generateDelay);
    }
    for (const timer of [this.generateTimer, this.scanTimer]) {
      if (timer) {
        clearInterval(timer);
      }
    }
    this.generateDelay = null;
    this.generateTimer = null;
    this.scanTimer = null;
  }

  /** Текущее состояние проходов — для отладочного эндпоинта/логов. */
  getState(): SweepState {
    return { ...this.state };
  }

  /** Один проход генерации; повторный вход пропускается, ошибки не летят в таймер. */
  async runGenerate(now: Date = new Date()): Promise<void> {
    if (this.generating) {
      this.logger.warn('Предыдущий проход генерации ещё не завершён — проход пропущен');
      return;
    }
    this.generating = true;
    try {
      const result = await this.schedule.generateForCurrentHour(now);
      if (result) {
        this.state.lastGenerateAt = new Date().toISOString();
        this.state.lastGenerateDate = result.date;
        if (result.ticketServiceUnavailable) {
          this.logger.error(`Генерация на ${result.date} не выполнена: ticket-service недоступен`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Проход генерации завершился ошибкой: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.generating = false;
    }
  }

  /** Догоняющая генерация при старте: тот же замок, что у планового прохода. */
  async runCatchUp(now: Date = new Date()): Promise<void> {
    if (this.generating) {
      return;
    }
    this.generating = true;
    try {
      const result = await this.schedule.catchUpToday(now);
      if (result) {
        this.state.lastGenerateAt = new Date().toISOString();
        this.state.lastGenerateDate = result.date;
        this.logger.log(
          `Догоняющая генерация на ${result.date}: создано смен ${result.shiftsCreated}, ` +
            `уже было ${result.shiftsSkipped}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Догоняющая генерация завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.generating = false;
    }
  }

  /** Один проход проверки неявок + авто check-out; ошибки не роняют сервис. */
  async runScan(now: Date = new Date()): Promise<void> {
    if (this.scanning) {
      this.logger.warn('Предыдущий проход проверки неявок ещё не завершён — проход пропущен');
      return;
    }
    this.scanning = true;
    try {
      const result = await this.schedule.scanMissedAndAutoCheckout(undefined, now);
      this.state.lastScanAt = new Date().toISOString();
      if (result.missed.missed > 0) {
        this.logger.warn(`Проход неявок: ${result.missed.missed} смен переведено в MISSED`);
      }
      if (result.autoCheckout.closed > 0) {
        this.logger.warn(`Авто check-out: закрыто ${result.autoCheckout.closed} смен`);
      }
    } catch (error) {
      this.logger.error(
        `Проход проверки неявок завершился ошибкой: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.scanning = false;
    }
  }
}
