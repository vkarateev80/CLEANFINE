import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EscalationService } from './escalation.service';
import { TicketsService } from './tickets.service';

const NOW = new Date('2026-01-01T10:00:00.000Z');

function createConfig(values: Record<string, unknown> = {}): ConfigService {
  const base: Record<string, unknown> = {
    'escalation.intervalMs': 1000,
    'escalation.newToAcceptMin': 5,
    'escalation.enabled': true,
  };
  return { get: jest.fn((key: string) => ({ ...base, ...values })[key]) } as unknown as ConfigService;
}

describe('EscalationService (М3.5)', () => {
  let prisma: { ticket: { findMany: jest.Mock } };
  let tickets: { escalateUnaccepted: jest.Mock; markOverdue: jest.Mock };
  let service: EscalationService;

  beforeEach(() => {
    prisma = { ticket: { findMany: jest.fn().mockResolvedValue([]) } };
    tickets = { escalateUnaccepted: jest.fn(), markOverdue: jest.fn() };
    service = new EscalationService(
      prisma as unknown as PrismaService,
      tickets as unknown as TicketsService,
      createConfig(),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scan', () => {
    it('эскалирует непринятые NEW и переводит просроченные заявки в OVERDUE', async () => {
      prisma.ticket.findMany.mockImplementation((args: { where: { status?: unknown } }) => {
        const status = args.where.status;
        if (status === 'new') {
          return Promise.resolve([{ id: 't-new' }]);
        }
        if (status === 'assigned') {
          return Promise.resolve([{ id: 't-arrive' }, { id: 't-raced' }]);
        }
        return Promise.resolve([{ id: 't-done' }]);
      });
      tickets.escalateUnaccepted.mockResolvedValue({ id: 't-new' });
      // Вторая заявка успела сменить статус — служебный метод вернул null (гонка).
      tickets.markOverdue.mockImplementation((id: string) =>
        Promise.resolve(id === 't-raced' ? null : { id }),
      );

      const result = await service.scan(NOW);

      expect(result).toEqual({
        skipped: false,
        escalated: ['t-new'],
        overdue: ['t-arrive', 't-done'],
        failed: false,
      });

      // Порог: NEW старше ESCALATION_NEW_TO_ACCEPT_MIN (5 мин) — дедлайн 09:55.
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'new',
            escalatedAt: null,
            createdAt: { lte: new Date('2026-01-01T09:55:00.000Z') },
          },
        }),
      );
      // Прибытие: assigned с истёкшим arrivalDeadline.
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'assigned', arrivalDeadline: { lte: NOW } },
        }),
      );
      // Выполнение: in_progress/paused с истёкшим completionDeadline.
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: ['in_progress', 'paused'] }, completionDeadline: { lte: NOW } },
        }),
      );
      expect(tickets.escalateUnaccepted).toHaveBeenCalledWith('t-new', NOW);
      expect(tickets.markOverdue).toHaveBeenCalledWith('t-arrive', NOW);
    });

    it('пустая выборка: служебные переходы не вызываются', async () => {
      const result = await service.scan(NOW);

      expect(result.escalated).toEqual([]);
      expect(result.overdue).toEqual([]);
      expect(tickets.escalateUnaccepted).not.toHaveBeenCalled();
      expect(tickets.markOverdue).not.toHaveBeenCalled();
    });

    it('падение БД не роняет сервис: failed=true, следующий проход попробует снова', async () => {
      prisma.ticket.findMany.mockRejectedValue(new Error('P1001: Can not reach database'));

      const result = await service.scan(NOW);

      expect(result.failed).toBe(true);
      expect(result.escalated).toEqual([]);
    });

    it('повторный вход во время незавершённого прохода пропускается', async () => {
      let release: ((value: unknown) => void) | undefined;
      prisma.ticket.findMany.mockImplementation((args: { where: { status?: unknown } }) =>
        args.where.status === 'new'
          ? Promise.resolve([{ id: 't-new' }])
          : Promise.resolve([]),
      );
      tickets.escalateUnaccepted
        // Первый проход «зависает» на переходе — имитируем долгий вызов.
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        )
        .mockResolvedValue(null);

      const first = service.scan(NOW);
      const second = await service.scan(NOW);

      expect(second.skipped).toBe(true);
      expect(tickets.escalateUnaccepted).toHaveBeenCalledTimes(1);

      release?.(null);
      await expect(first).resolves.toEqual({
        skipped: false,
        escalated: [],
        overdue: [],
        failed: false,
      });
      // После завершения прохода сканер снова работоспособен.
      expect(await service.scan(NOW)).toEqual({
        skipped: false,
        escalated: [],
        overdue: [],
        failed: false,
      });
    });
  });

  describe('жизненный цикл таймера', () => {
    it('onModuleInit запускает периодическое сканирование и onModuleDestroy его останавливает', async () => {
      jest.useFakeTimers();
      prisma.ticket.findMany.mockResolvedValue([]);

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(1000);

      // Один проход = три выборки (NEW, assigned, in_progress/paused).
      expect(prisma.ticket.findMany).toHaveBeenCalledTimes(3);

      service.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('TICKET_ESCALATION_ENABLED=false полностью выключает сканер', async () => {
      jest.useFakeTimers();
      service = new EscalationService(
        prisma as unknown as PrismaService,
        tickets as unknown as TicketsService,
        createConfig({ 'escalation.enabled': false }),
      );

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(5000);

      expect(prisma.ticket.findMany).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      // Повторный вызов безопасен (onModuleDestroy идемпотентен).
      service.onModuleDestroy();
    });

    it('интервал по умолчанию — 30 с, если env не задан', async () => {
      jest.useFakeTimers();
      service = new EscalationService(
        prisma as unknown as PrismaService,
        tickets as unknown as TicketsService,
        { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      );

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(29_999);
      expect(prisma.ticket.findMany).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(prisma.ticket.findMany).toHaveBeenCalledTimes(3);

      service.onModuleDestroy();
    });
  });
});
