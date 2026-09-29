import type { AuthUser } from '../auth/guards/roles.guard';
import { ScheduleController } from './schedule.controller';
import type { ScheduleService } from './schedule.service';
import type { SchedulerService } from './scheduler.service';

const USER = {
  id: 'user-1',
  email: 'op@cleaning-ops.com',
  role: 'OPERATOR',
  fullName: '',
} as AuthUser;

function build() {
  const schedule = {
    create: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
    update: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
    remove: jest.fn().mockResolvedValue({ id: 'schedule-1', deleted: true, eventsDeleted: 1 }),
    listEvents: jest.fn().mockResolvedValue([]),
    listMyEvents: jest.fn().mockResolvedValue([]),
    getEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
    checkIn: jest.fn().mockResolvedValue({ id: 'event-1', status: 'CHECKED_IN' }),
    checkOut: jest.fn().mockResolvedValue({ id: 'event-1', status: 'CHECKED_OUT' }),
    generateForDate: jest.fn().mockResolvedValue({ date: '2026-09-16' }),
    scanMissedAndAutoCheckout: jest.fn().mockResolvedValue({
      missed: { scanned: 0, missed: 0, eventIds: [] },
      autoCheckout: { closed: 0, eventIds: [] },
    }),
  } as unknown as jest.Mocked<ScheduleService>;

  const scheduler = {
    getState: jest.fn().mockReturnValue({
      lastGenerateAt: null,
      lastScanAt: null,
      lastGenerateDate: null,
    }),
  } as unknown as jest.Mocked<SchedulerService>;

  return { controller: new ScheduleController(schedule, scheduler), schedule, scheduler };
}

describe('ScheduleController', () => {
  it('create/list/getById/update/remove делегируют в ScheduleService', async () => {
    const { controller, schedule } = build();
    const dto = {
      name: 'Уборка',
      recurrence: { frequency: 'daily' as const, time: '08:00' },
      assignees: ['user-1'],
    };

    await controller.create(dto);
    expect(schedule.create).toHaveBeenCalledWith(dto);

    await controller.list();
    expect(schedule.list).toHaveBeenCalled();

    await controller.getById('schedule-1');
    expect(schedule.getById).toHaveBeenCalledWith('schedule-1');

    await controller.update('schedule-1', { name: 'Новое' });
    expect(schedule.update).toHaveBeenCalledWith('schedule-1', { name: 'Новое' });

    await controller.remove('schedule-1');
    expect(schedule.remove).toHaveBeenCalledWith('schedule-1');
  });

  it('events/my/event отдают выборки смен', async () => {
    const { controller, schedule } = build();

    await controller.events({ date: '2026-09-16', objectId: 'object-1', userId: 'user-1' });
    expect(schedule.listEvents).toHaveBeenCalledWith({
      date: '2026-09-16',
      objectId: 'object-1',
      userId: 'user-1',
    });

    await controller.my(USER, {});
    expect(schedule.listMyEvents).toHaveBeenCalledWith(USER.id, {});

    await controller.event('event-1');
    expect(schedule.getEvent).toHaveBeenCalledWith('event-1');
  });

  it('check-in передаёт пользователя, DTO и проброшенный токен', async () => {
    const { controller, schedule } = build();

    await controller.checkIn(
      USER,
      { scheduleId: 'schedule-1', lat: 55.75, lng: 37.61 },
      'user-token',
    );

    expect(schedule.checkIn).toHaveBeenCalledWith(
      USER.id,
      { scheduleId: 'schedule-1', lat: 55.75, lng: 37.61 },
      'user-token',
    );
  });

  it('check-out передаёт пользователя и DTO', async () => {
    const { controller, schedule } = build();

    await controller.checkOut(USER, { scheduleId: 'schedule-1' });

    expect(schedule.checkOut).toHaveBeenCalledWith(USER.id, { scheduleId: 'schedule-1' });
  });

  it('generate/check-missed — детерминированные триггеры, state — состояние проходов', async () => {
    const { controller, schedule, scheduler } = build();

    await controller.generate({ date: '2026-09-16' });
    expect(schedule.generateForDate).toHaveBeenCalledWith('2026-09-16', undefined, {
      scheduleId: undefined,
    });

    await controller.generate({});
    expect(schedule.generateForDate).toHaveBeenLastCalledWith(undefined, undefined, {
      scheduleId: undefined,
    });

    await controller.checkMissed({ date: '2026-09-16' });
    expect(schedule.scanMissedAndAutoCheckout).toHaveBeenCalledWith('2026-09-16', undefined, {
      scheduleId: undefined,
      eventId: undefined,
    });

    expect(await controller.schedulerState()).toEqual({
      lastGenerateAt: null,
      lastScanAt: null,
      lastGenerateDate: null,
    });
    expect(scheduler.getState).toHaveBeenCalled();
  });

  it('generate/check-missed передают область прохода scheduleId/eventId (задача A2)', async () => {
    const { controller, schedule } = build();

    await controller.generate({ date: '2026-09-16', scheduleId: 'schedule-7' });
    expect(schedule.generateForDate).toHaveBeenLastCalledWith('2026-09-16', undefined, {
      scheduleId: 'schedule-7',
    });

    await controller.checkMissed({ scheduleId: 'schedule-7' });
    expect(schedule.scanMissedAndAutoCheckout).toHaveBeenLastCalledWith(undefined, undefined, {
      scheduleId: 'schedule-7',
      eventId: undefined,
    });

    await controller.checkMissed({ eventId: 'event-9' });
    expect(schedule.scanMissedAndAutoCheckout).toHaveBeenLastCalledWith(undefined, undefined, {
      scheduleId: undefined,
      eventId: 'event-9',
    });
  });
});
