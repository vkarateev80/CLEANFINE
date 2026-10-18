import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SETTINGS_ID, ScheduleSettingsService } from './schedule-settings.service';

function build(row: unknown = null, configuredTimeZone?: string) {
  const prisma = {
    scheduleSettings: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert: jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...create, updatedAt: new Date('2026-10-18T18:00:00.000Z') }),
      ),
    },
  };
  const config = {
    get: jest.fn((key: string) => (key === 'schedule.timeZone' ? configuredTimeZone : undefined)),
  } as unknown as ConfigService;
  const service = new ScheduleSettingsService(prisma as unknown as PrismaService, config);
  return { service, prisma };
}

describe('ScheduleSettingsService (часовой пояс расписания)', () => {
  it('без строки в БД — пояс из конфига, по умолчанию Москва', async () => {
    expect(await build(null).service.timeZone()).toBe('Europe/Moscow');
    expect(await build(null, 'Asia/Tashkent').service.timeZone()).toBe('Asia/Tashkent');
    expect(await build(null, 'Марс/Олимп').service.timeZone()).toBe('Europe/Moscow');
  });

  it('таблицы ещё нет (код раньше миграции) — не падает, берёт пояс по умолчанию', async () => {
    const { service, prisma } = build();
    prisma.scheduleSettings.findUnique.mockRejectedValue(new Error('relation does not exist'));

    expect(await service.timeZone()).toBe('Europe/Moscow');
  });

  it('пояс из БД кэшируется: второй запрос не идёт в базу', async () => {
    const { service, prisma } = build({
      id: SETTINGS_ID,
      timeZone: 'Asia/Bishkek',
      updatedAt: new Date(),
      updatedBy: 'admin-1',
    });

    expect(await service.timeZone()).toBe('Asia/Bishkek');
    expect(await service.timeZone()).toBe('Asia/Bishkek');
    expect(prisma.scheduleSettings.findUnique).toHaveBeenCalledTimes(1);
  });

  it('view: подписи пояса и сегодняшний день расписания', async () => {
    const { service } = build(null);

    const view = await service.view(new Date('2026-10-18T21:30:00.000Z'));

    expect(view).toMatchObject({
      timeZone: 'Europe/Moscow',
      timeZoneTitle: 'Москва, Санкт-Петербург (UTC+3)',
      timeZoneShortLabel: 'МСК',
      utcOffsetMinutes: 180,
      today: '2026-10-19',
      updatedAt: null,
    });
  });

  it('update: сохраняет пояс upsert-ом и сразу отдаёт новый', async () => {
    const { service, prisma } = build(null);
    await service.timeZone();

    const view = await service.update({ timeZone: ' Asia/Bishkek ' }, 'admin-1');

    expect(prisma.scheduleSettings.upsert).toHaveBeenCalledWith({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, timeZone: 'Asia/Bishkek', updatedBy: 'admin-1' },
      update: { timeZone: 'Asia/Bishkek', updatedBy: 'admin-1' },
    });
    expect(view.timeZone).toBe('Asia/Bishkek');
    expect(view.timeZoneShortLabel).toBe('UTC+6');
    expect(await service.timeZone()).toBe('Asia/Bishkek');
  });

  it('update: неизвестный пояс — 400, в базу не пишет', async () => {
    const { service, prisma } = build(null);

    await expect(service.update({ timeZone: 'Europe/Mosсow' }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.scheduleSettings.upsert).not.toHaveBeenCalled();
  });
});
