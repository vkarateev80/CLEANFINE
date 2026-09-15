import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { GeofenceExitEvent } from '@cleaning-ops/shared/types/events';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_NEARBY_MAX_AGE_MINUTES,
} from '../config/constants';
import { DEFAULT_NEARBY_RADIUS_METERS } from './gps.constants';
import { EventsPublisher } from '../events/events.publisher';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/guards/roles.guard';
import type { TrackBatchDto, TrackHistoryQueryDto } from './dto/gps.dto';
import { GeofenceService } from './geofence.service';

/** Точка трека после нормализации: timestamp всегда Date, отсутствующие поля — null. */
interface NormalizedPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  timestamp: Date;
}

export interface GeofenceExitRecord {
  geofenceId: string;
  objectId: string;
  name: string | null;
  /** Опубликовано ли событие в RabbitMQ (false — брокер недоступен, треки всё равно приняты). */
  published: boolean;
}

export interface TrackBatchResult {
  userId: string;
  accepted: number;
  employeeName: string;
  lastPointAt: string;
  geofenceExits: GeofenceExitRecord[];
}

export interface TrackRecord {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  batteryLevel: number | null;
  timestamp: string;
}

export interface TrackHistoryResult {
  userId: string;
  from: string | null;
  to: string | null;
  count: number;
  tracks: TrackRecord[];
}

export interface NearbyEmployee {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  batteryLevel: number | null;
  timestamp: string;
  distanceMeters: number | null;
}

export interface NearbyEmployeesResult {
  lat: number;
  lng: number;
  radiusMeters: number;
  maxAgeMinutes: number;
  count: number;
  employees: NearbyEmployee[];
}

interface RawTrackRow {
  id: string;
  user_id: string;
  lat: number | string | null;
  lng: number | string | null;
  accuracy: number | string | null;
  speed: number | string | null;
  battery_level: number | null;
  timestamp: Date;
}

interface RawNearbyRow {
  user_id: string;
  lat: number | string | null;
  lng: number | string | null;
  accuracy: number | string | null;
  speed: number | string | null;
  battery_level: number | null;
  timestamp: Date;
  distance_meters: number | string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Приём GPS-треков и поиск сотрудников (М3.1/М3.2).
 * Геометрия пишется/читается только через $queryRaw/$executeRaw: Prisma не
 * поддерживает PostGIS-типы (см. prisma/schema.prisma).
 */
@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geofences: GeofenceService,
    private readonly events: EventsPublisher,
    private readonly config: ConfigService,
  ) {}

  /**
   * Batch-приём точек (УСТАВ → GPS, п.2): валидация → batch-insert →
   * проверка геозон → эмиссия geofence.exit при выходе из геозоны.
   */
  async trackBatch(dto: TrackBatchDto, user: AuthUser): Promise<TrackBatchResult> {
    const maxBatchSize = this.config.get<number>('gps.maxBatchSize') ?? DEFAULT_MAX_BATCH_SIZE;

    if (dto.tracks.length === 0) {
      throw new BadRequestException('tracks не может быть пустым');
    }
    if (dto.tracks.length > maxBatchSize) {
      throw new BadRequestException(`За один запрос не более ${maxBatchSize} точек`);
    }
    // Треки пишутся только за себя: подмена userId — прерогатива ADMIN/SUPERVISOR.
    if (dto.userId && dto.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPERVISOR') {
      throw new ForbiddenException('Можно отправлять треки только за себя');
    }

    const userId = dto.userId ?? user.id;
    const employeeName = dto.employeeName ?? (user.fullName || user.email || '');
    const points: NormalizedPoint[] = dto.tracks
      .map((point) => ({
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy ?? null,
        speed: point.speed ?? null,
        battery: point.battery ?? null,
        timestamp: point.timestamp ? new Date(point.timestamp) : new Date(),
      }))
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

    // Состояние «до batch» читаем до вставки: только так можно отличить выход из геозоны.
    const previousGeofences = await this.geofences.findContainingBefore(userId, points[0].timestamp);
    const accepted = await this.insertTracks(userId, points);

    const lastPoint = points[points.length - 1];
    const currentGeofences = await this.geofences.findContainingGeofences(lastPoint.lat, lastPoint.lng);
    const insideIds = new Set(currentGeofences.map((geofence) => geofence.id));
    const exited = previousGeofences.filter((geofence) => !insideIds.has(geofence.id));

    const geofenceExits: GeofenceExitRecord[] = [];
    for (const geofence of exited) {
      const event: GeofenceExitEvent = {
        userId,
        employeeName,
        objectId: geofence.objectId,
        timestamp: toIso(lastPoint.timestamp),
      };
      const published = await this.events.publishGeofenceExit(event);
      geofenceExits.push({
        geofenceId: geofence.id,
        objectId: geofence.objectId,
        name: geofence.name,
        published,
      });
    }

    this.logger.log(
      `Треки приняты: user=${userId}, точек=${accepted}, выходов из геозон=${geofenceExits.length}`,
    );

    return {
      userId,
      accepted,
      employeeName,
      lastPointAt: toIso(lastPoint.timestamp),
      geofenceExits,
    };
  }

  /** История перемещений сотрудника с фильтром по времени (М3.2). */
  async history(query: TrackHistoryQueryDto): Promise<TrackHistoryResult> {
    const limit = query.limit ?? this.config.get<number>('gps.historyLimit') ?? DEFAULT_HISTORY_LIMIT;

    const conditions: Prisma.Sql[] = [Prisma.sql`user_id = ${query.userId}::uuid`];
    if (query.from) {
      conditions.push(Prisma.sql`timestamp >= ${new Date(query.from)}`);
    }
    if (query.to) {
      conditions.push(Prisma.sql`timestamp <= ${new Date(query.to)}`);
    }

    const rows = await this.prisma.$queryRaw<RawTrackRow[]>`
      SELECT
        id,
        user_id,
        ST_Y(location) AS lat,
        ST_X(location) AS lng,
        accuracy,
        speed,
        battery_level,
        timestamp
      FROM gps_tracks
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;

    return {
      userId: query.userId,
      from: query.from ?? null,
      to: query.to ?? null,
      count: rows.length,
      tracks: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        lat: toNumber(row.lat) ?? 0,
        lng: toNumber(row.lng) ?? 0,
        accuracy: toNumber(row.accuracy),
        speed: toNumber(row.speed),
        batteryLevel: row.battery_level,
        timestamp: toIso(row.timestamp),
      })),
    };
  }

  /**
   * SQL из устава п.4: последняя точка каждого пользователя не старше 5 минут
   * в радиусе от точки SOS (одна точка на пользователя через DISTINCT ON).
   *
   * Отличие от устава: нет JOIN users u (u.full_name) — пользователи живут в БД
   * auth-service (cleaning_ops), а gps-service работает со своей БД
   * (cleaning_ops_gps); кросс-БД join невозможен, имена резолвят потребители
   * (ticket-service/notification-service) по userId.
   */
  async findNearbyEmployees(
    lat: number,
    lng: number,
    radiusMeters: number = DEFAULT_NEARBY_RADIUS_METERS,
  ): Promise<NearbyEmployeesResult> {
    const maxAgeMinutes =
      this.config.get<number>('gps.nearbyMaxAgeMinutes') ?? DEFAULT_NEARBY_MAX_AGE_MINUTES;

    const rows = await this.prisma.$queryRaw<RawNearbyRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (gps.user_id)
          gps.user_id,
          ST_Y(gps.location) AS lat,
          ST_X(gps.location) AS lng,
          gps.accuracy,
          gps.speed,
          gps.battery_level,
          gps.timestamp,
          ST_Distance(
            gps.location::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) AS distance_meters
        FROM gps_tracks gps
        WHERE ST_DWithin(
          gps.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
          AND gps.timestamp > NOW() - make_interval(mins => ${maxAgeMinutes}::int)
        ORDER BY gps.user_id, gps.timestamp DESC
      ) AS last_points
      ORDER BY distance_meters ASC
    `;

    return {
      lat,
      lng,
      radiusMeters,
      maxAgeMinutes,
      count: rows.length,
      employees: rows.map((row) => ({
        userId: row.user_id,
        lat: toNumber(row.lat) ?? 0,
        lng: toNumber(row.lng) ?? 0,
        accuracy: toNumber(row.accuracy),
        speed: toNumber(row.speed),
        batteryLevel: row.battery_level,
        timestamp: toIso(row.timestamp),
        distanceMeters: toNumber(row.distance_meters),
      })),
    };
  }

  /** Один INSERT на весь batch: точки уходят в PostGIS одним запросом. */
  private async insertTracks(userId: string, points: NormalizedPoint[]): Promise<number> {
    const values = points.map(
      (point) => Prisma.sql`(
        ${userId}::uuid,
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
        ${point.accuracy},
        ${point.speed},
        ${point.battery},
        ${point.timestamp}
      )`,
    );

    return this.prisma.$executeRaw`
      INSERT INTO gps_tracks (user_id, location, accuracy, speed, battery_level, timestamp)
      VALUES ${Prisma.join(values)}
    `;
  }
}
