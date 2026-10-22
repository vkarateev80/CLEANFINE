import { ConfigService } from '@nestjs/config';
import { ScheduleService } from './schedule.service';
import { SchedulerService } from './scheduler.service';

const NOW = new Date('2026-09-16T00:00:00.000Z');

/**
 * Даёт догоняющей генерации при старте завершиться: она держит тот же замок,
 * что и плановый тик, поэтому таймеры двигаем только после неё.
 */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

/** Продвигает фейковые таймеры по одному тику, давая микрозадачам выполниться. */
async function flushTimers(ticks: number, stepMs: number): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    jest.advanceTimersByTime(stepMs);
    await Promise.resolve();
  }
}

function build(configValues: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'schedule.cronEnabled': true,
    'schedule.generateIntervalMs': 60_000,
    'schedule.generateHourUtc': 0,
    'schedule.missedCheckinIntervalMs': 1_000,
    ...configValues,
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;

  const schedule = {
    generateForCurrentHour: jest.fn().mockResolvedValue(null),
    catchUpToday: jest.fn().mockResolvedValue(null),
    scanMissedAndAutoCheckout: jest.fn().mockResolvedValue({
      missed: { scanned: 0, missed: 0, eventIds: [] },
      autoCheckout: { closed: 0, eventIds: [] },
    }),
  } as unknown as jest.Mocked<ScheduleService>;

  const scheduler = new SchedulerService(schedule, config);
  return { scheduler, schedule, config };
}

describe('SchedulerService (М4.4–М4.5)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('таймер генерации срабатывает по своему интервалу', async () => {
      jest.useFakeTimers();
      const { scheduler, schedule, config } = build();

      scheduler.onModuleInit();

      expect(config.get).toHaveBeenCalledWith('schedule.generateIntervalMs');
      // При старте — догоняющая генерация, плановый тик ждёт границы интервала.
      expect(schedule.catchUpToday).toHaveBeenCalledTimes(1);
      expect(schedule.generateForCurrentHour).not.toHaveBeenCalled();
      await settle();

      await flushTimers(1, 60_000);
      expect(schedule.generateForCurrentHour).toHaveBeenCalledTimes(1);

      await flushTimers(2, 60_000);
      scheduler.onModuleDestroy();
      await flushTimers(5, 60_000);
      expect(schedule.generateForCurrentHour).toHaveBeenCalledTimes(3);
    });

    it('таймер неявок срабатывает по своему интервалу и гасится при остановке', async () => {
      jest.useFakeTimers();
      const { scheduler, schedule } = build();

      scheduler.onModuleInit();

      expect(schedule.scanMissedAndAutoCheckout).not.toHaveBeenCalled();
      await flushTimers(1, 1_000);
      expect(schedule.scanMissedAndAutoCheckout).toHaveBeenCalledTimes(1);

      scheduler.onModuleDestroy();
      await flushTimers(10, 1_000);
      expect(schedule.scanMissedAndAutoCheckout).toHaveBeenCalledTimes(1);
    });

    it('SCHEDULE_CRON_ENABLED=false отключает таймеры', async () => {
      jest.useFakeTimers();
      const { scheduler, schedule } = build({ 'schedule.cronEnabled': false });

      scheduler.onModuleInit();
      await flushTimers(3, 60_000);

      expect(schedule.catchUpToday).not.toHaveBeenCalled();
      expect(schedule.generateForCurrentHour).not.toHaveBeenCalled();
      expect(schedule.scanMissedAndAutoCheckout).not.toHaveBeenCalled();
    });

    it('тик генерации выровнен по границе интервала, а не по моменту старта', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-19T00:29:29.000Z') });
      const { scheduler, schedule } = build();

      scheduler.onModuleInit();
      await settle();

      // Старт в :29 при минутном интервале → первый тик ровно через 31 секунду.
      await flushTimers(30, 1_000);
      expect(schedule.generateForCurrentHour).not.toHaveBeenCalled();
      await flushTimers(1, 1_000);
      expect(schedule.generateForCurrentHour).toHaveBeenCalledTimes(1);

      scheduler.onModuleDestroy();
      await flushTimers(5, 60_000);
      expect(schedule.generateForCurrentHour).toHaveBeenCalledTimes(1);
    });

    it('догоняющая генерация обновляет состояние прохода', async () => {
      const { scheduler, schedule } = build();
      schedule.catchUpToday.mockResolvedValue({
        date: '2026-09-16',
        schedulesMatched: 1,
        shiftsCreated: 2,
        shiftsSkipped: 0,
        ticketsCreated: 2,
        ticketsFailed: 0,
        ticketsBackfilled: 0,
        ticketServiceUnavailable: false,
        errors: [],
      });

      await scheduler.runCatchUp(NOW);

      expect(scheduler.getState().lastGenerateDate).toBe('2026-09-16');
      expect(scheduler.getState().lastGenerateAt).not.toBeNull();
    });

    it('onModuleDestroy безопасен без предварительного init', () => {
      const { scheduler } = build();
      expect(() => scheduler.onModuleDestroy()).not.toThrow();
    });
  });

  describe('runGenerate', () => {
    it('обновляет состояние прохода', async () => {
      const { scheduler, schedule } = build();
      schedule.generateForCurrentHour.mockResolvedValue({
        date: '2026-09-16',
        schedulesMatched: 1,
        shiftsCreated: 2,
        shiftsSkipped: 0,
        ticketsCreated: 2,
        ticketsFailed: 0,
        ticketsBackfilled: 0,
        ticketServiceUnavailable: false,
        errors: [],
      });

      await scheduler.runGenerate(NOW);

      expect(scheduler.getState()).toMatchObject({
        lastGenerateDate: '2026-09-16',
        lastGenerateAt: expect.any(String),
      });
    });

    it('не пробрасывает ошибку в таймер', async () => {
      const { scheduler, schedule } = build();
      schedule.generateForCurrentHour.mockRejectedValue(new Error('БД недоступна'));

      await expect(scheduler.runGenerate(NOW)).resolves.toBeUndefined();
    });

    it('пропускает проход, если предыдущий ещё идёт', async () => {
      const { scheduler, schedule } = build();
      let release: (value: null) => void = () => undefined;
      schedule.generateForCurrentHour.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );

      const first = scheduler.runGenerate(NOW);
      await scheduler.runGenerate(NOW);
      expect(schedule.generateForCurrentHour).toHaveBeenCalledTimes(1);

      release(null);
      await first;
    });
  });

  describe('runScan', () => {
    it('обновляет состояние прохода', async () => {
      const { scheduler } = build();

      await scheduler.runScan(NOW);

      expect(scheduler.getState().lastScanAt).toEqual(expect.any(String));
    });

    it('логирует неявки и авто check-out, не пробрасывая ошибку', async () => {
      const { scheduler, schedule } = build();
      schedule.scanMissedAndAutoCheckout.mockResolvedValue({
        missed: { scanned: 3, missed: 2, eventIds: ['a', 'b'] },
        autoCheckout: { closed: 1, eventIds: ['c'] },
      });

      await scheduler.runScan(NOW);

      expect(scheduler.getState().lastScanAt).toEqual(expect.any(String));

      schedule.scanMissedAndAutoCheckout.mockRejectedValue(new Error('БД недоступна'));
      await expect(scheduler.runScan(NOW)).resolves.toBeUndefined();
    });

    it('пропускает проход, если предыдущий ещё идёт', async () => {
      const { scheduler, schedule } = build();
      let release: (value: unknown) => void = () => undefined;
      schedule.scanMissedAndAutoCheckout.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );

      const first = scheduler.runScan(NOW);
      await scheduler.runScan(NOW);
      expect(schedule.scanMissedAndAutoCheckout).toHaveBeenCalledTimes(1);

      release({
        missed: { scanned: 0, missed: 0, eventIds: [] },
        autoCheckout: { closed: 0, eventIds: [] },
      });
      await first;
    });
  });

  it('getState в начале пуст', () => {
    const { scheduler } = build();
    expect(scheduler.getState()).toEqual({
      lastGenerateAt: null,
      lastScanAt: null,
      lastGenerateDate: null,
    });
  });
});
