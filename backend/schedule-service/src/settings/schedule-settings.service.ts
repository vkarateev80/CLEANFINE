import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_SCHEDULE_TIME_ZONE,
  isValidTimeZone,
  scheduleDateOf,
  timeZoneOffsetMinutes,
  timeZoneShortLabel,
  timeZoneTitle,
  type ScheduleSettingsView,
} from '@cleaning-ops/shared/types/time-zone';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateScheduleSettingsDto } from './schedule-settings.dto';

/** Единственная строка настроек. */
export const SETTINGS_ID = 'default';

/** Сколько держим настройки в памяти: пояс читается на каждую смену и отметку. */
export const SETTINGS_CACHE_MS = 30_000;

interface StoredSettings {
  timeZone: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Настройки расписания организации (18.10.2026): часовой пояс, в котором заданы
 * время графиков, день смены и «сегодня». Строка в БД появляется при первой
 * правке; до неё — и если таблицы ещё нет (код выкачен раньше миграции) — пояс
 * берётся из `SCHEDULE_TIME_ZONE` (по умолчанию Europe/Moscow), сервис не падает.
 */
@Injectable()
export class ScheduleSettingsService {
  private readonly logger = new Logger(ScheduleSettingsService.name);
  private cache: { value: StoredSettings; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Пояс расписания (IANA). */
  async timeZone(): Promise<string> {
    return (await this.current()).timeZone;
  }

  /** `GET /api/schedule/settings`: пояс, подписи и сегодняшний день расписания. */
  async view(now: Date = new Date()): Promise<ScheduleSettingsView> {
    return toView(await this.current(), now);
  }

  /** `PATCH /api/schedule/settings` (ADMIN): смена пояса. */
  async update(
    dto: UpdateScheduleSettingsDto,
    userId: string | undefined,
  ): Promise<ScheduleSettingsView> {
    const timeZone = dto.timeZone.trim();
    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException(`Неизвестный часовой пояс: ${dto.timeZone}`);
    }
    const before = await this.timeZone();
    const row = await this.prisma.scheduleSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, timeZone, updatedBy: userId ?? null },
      update: { timeZone, updatedBy: userId ?? null },
    });
    const value: StoredSettings = {
      timeZone: row.timeZone,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
    this.cache = { value, at: Date.now() };
    this.logger.log(`Часовой пояс расписания: ${before} → ${timeZone} (${userId ?? 'неизвестно кто'})`);
    return toView(value, new Date());
  }

  private async current(): Promise<StoredSettings> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < SETTINGS_CACHE_MS) {
      return this.cache.value;
    }
    let value: StoredSettings;
    try {
      const row = await this.prisma.scheduleSettings.findUnique({ where: { id: SETTINGS_ID } });
      value =
        row && isValidTimeZone(row.timeZone)
          ? { timeZone: row.timeZone, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
          : this.fallback();
    } catch (error) {
      // До `prisma migrate deploy` таблицы нет: работаем с поясом по умолчанию.
      value = this.fallback();
      this.logger.warn(
        `Настройки расписания не прочитаны (${error instanceof Error ? error.message : String(error)}); ` +
          `пояс ${value.timeZone}`,
      );
    }
    this.cache = { value, at: now };
    return value;
  }

  private fallback(): StoredSettings {
    const configured = this.config.get<string>('schedule.timeZone');
    return {
      timeZone: configured && isValidTimeZone(configured) ? configured : DEFAULT_SCHEDULE_TIME_ZONE,
      updatedAt: null,
      updatedBy: null,
    };
  }
}

function toView(value: StoredSettings, now: Date): ScheduleSettingsView {
  return {
    timeZone: value.timeZone,
    timeZoneTitle: timeZoneTitle(value.timeZone, now),
    timeZoneShortLabel: timeZoneShortLabel(value.timeZone, now),
    utcOffsetMinutes: timeZoneOffsetMinutes(value.timeZone, now),
    today: scheduleDateOf(now, value.timeZone),
    updatedAt: value.updatedAt ? value.updatedAt.toISOString() : null,
    updatedBy: value.updatedBy,
  };
}
