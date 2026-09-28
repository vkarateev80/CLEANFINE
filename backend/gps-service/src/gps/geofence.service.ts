import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS } from '../config/constants';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGeofenceDto } from './dto/gps.dto';

export interface GeofenceGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeofenceEntity {
  id: string;
  objectId: string;
  name: string | null;
  radiusMeters: number | null;
  boundary: GeofenceGeometry | null;
}

/** Ссылка на геозону без геометрии — для проверок вхождения и событий. */
export interface GeofenceRef {
  id: string;
  objectId: string;
  name: string | null;
}

export interface GeofenceCheckResult {
  userId: string;
  lat: number;
  lng: number;
  inside: boolean;
  distanceMeters: number | null;
  geofence: (GeofenceRef & { radiusMeters: number | null }) | null;
  checkedAt: string;
}

interface RawGeofenceRow {
  id: string;
  object_id: string;
  name: string | null;
  radius_meters: number | null;
  boundary: GeofenceGeometry | string | null;
}

interface RawCheckRow {
  id: string;
  object_id: string;
  name: string | null;
  radius_meters: number | null;
  distance_meters: number | string | null;
  is_inside: boolean | null;
}

interface RawRefRow {
  id: string;
  object_id: string;
  name: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoundary(value: GeofenceGeometry | string | null): GeofenceGeometry | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as GeofenceGeometry;
    } catch {
      return null;
    }
  }
  return value;
}

/**
 * Геозоны объектов (УСТАВ → Агент Backend GPS, п.1 и п.3).
 *
 * Prisma не умеет PostGIS-типы, поэтому геометрия объявлена как
 * `Unsupported("geometry(Polygon, 4326)")`, а все запросы идут через $queryRaw.
 */
@Injectable()
export class GeofenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Создание геозоны: GeoJSON Polygon → geometry(Polygon, 4326). */
  async create(dto: CreateGeofenceDto): Promise<GeofenceEntity> {
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: dto.boundary.coordinates,
    });

    const rows = await this.prisma.$queryRaw<RawGeofenceRow[]>`
      INSERT INTO geofences (object_id, name, boundary, radius_meters)
      VALUES (
        ${dto.objectId}::uuid,
        ${dto.name ?? null},
        ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geometry(Polygon, 4326),
        ${dto.radiusMeters ?? null}
      )
      RETURNING
        id,
        object_id,
        name,
        radius_meters,
        ST_AsGeoJSON(boundary)::json AS boundary
    `;

    const created = rows[0];
    if (!created) {
      throw new BadRequestException('Геозона не создана');
    }

    return {
      id: created.id,
      objectId: created.object_id,
      name: created.name,
      radiusMeters: toNumber(created.radius_meters),
      boundary: parseBoundary(created.boundary),
    };
  }

  /**
   * Список геозон (для карты и админки), опционально — только по объекту.
   * Геометрия отдаётся GeoJSON-ом, как и при создании.
   */
  async list(objectId?: string): Promise<GeofenceEntity[]> {
    const rows = objectId
      ? await this.prisma.$queryRaw<RawGeofenceRow[]>`
          SELECT
            id,
            object_id,
            name,
            radius_meters,
            ST_AsGeoJSON(boundary)::json AS boundary
          FROM geofences
          WHERE object_id = ${objectId}::uuid
          ORDER BY name NULLS LAST, id
        `
      : await this.prisma.$queryRaw<RawGeofenceRow[]>`
          SELECT
            id,
            object_id,
            name,
            radius_meters,
            ST_AsGeoJSON(boundary)::json AS boundary
          FROM geofences
          ORDER BY name NULLS LAST, id
        `;

    return rows.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      name: row.name,
      radiusMeters: toNumber(row.radius_meters),
      boundary: parseBoundary(row.boundary),
    }));
  }

  /**
   * SQL из устава п.3: ближайшая геозона в радиусе поиска + признак вхождения
   * (ST_Distance по geography — метры, ST_Contains — точка внутри полигона).
   */
  async check(
    userId: string,
    lat: number,
    lng: number,
    radiusMeters: number = DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS,
  ): Promise<GeofenceCheckResult> {
    const rows = await this.prisma.$queryRaw<RawCheckRow[]>`
      SELECT
        g.id,
        g.object_id,
        g.name,
        g.radius_meters,
        ST_Distance(
          g.boundary::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) AS distance_meters,
        ST_Contains(
          g.boundary,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        ) AS is_inside
      FROM geofences g
      WHERE ST_DWithin(
        g.boundary::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY distance_meters ASC
      LIMIT 1
    `;

    const nearest = rows[0];
    return {
      userId,
      lat,
      lng,
      inside: nearest ? nearest.is_inside === true : false,
      distanceMeters: nearest ? toNumber(nearest.distance_meters) : null,
      geofence: nearest
        ? {
            id: nearest.id,
            objectId: nearest.object_id,
            name: nearest.name,
            radiusMeters: toNumber(nearest.radius_meters),
          }
        : null,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Геозоны, содержащие точку (текущее состояние сотрудника). */
  async findContainingGeofences(lat: number, lng: number): Promise<GeofenceRef[]> {
    const rows = await this.prisma.$queryRaw<RawRefRow[]>`
      SELECT g.id, g.object_id, g.name
      FROM geofences g
      WHERE ST_Contains(
        g.boundary,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      )
    `;
    return rows.map(toRef);
  }

  /**
   * Геозоны, в которых сотрудник находился по последней точке до начала окна.
   * Нужны, чтобы отличить выход из геозоны (событие geofence.exit) от обычной
   * точки вне объектов — иначе событие уходило бы на каждую точку «в поле».
   */
  async findContainingBefore(userId: string, before: Date): Promise<GeofenceRef[]> {
    const rows = await this.prisma.$queryRaw<RawRefRow[]>`
      SELECT g.id, g.object_id, g.name
      FROM geofences g
      JOIN (
        SELECT location
        FROM gps_tracks
        WHERE user_id = ${userId}::uuid
          AND timestamp < ${before}
        ORDER BY timestamp DESC
        LIMIT 1
      ) AS last_point ON ST_Contains(g.boundary, last_point.location)
    `;
    return rows.map(toRef);
  }
}

function toRef(row: RawRefRow): GeofenceRef {
  return { id: row.id, objectId: row.object_id, name: row.name };
}
