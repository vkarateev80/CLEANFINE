import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  DEFAULT_NEARBY_RADIUS_METERS,
  MAX_ACCURACY_METERS,
  MAX_GEOFENCE_RADIUS_METERS,
  MAX_HISTORY_LIMIT,
  MAX_NEARBY_RADIUS_METERS,
  MAX_SPEED_MPS,
  MAX_TRACK_BATCH,
} from '../gps.constants';

/** Одна точка трека (УСТАВ → Агент Backend GPS, п.2). */
export class TrackPointDto {
  @ApiProperty({ description: 'Широта', example: 55.7558 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat должен быть широтой в градусах (-90..90)' })
  lat!: number;

  @ApiProperty({ description: 'Долгота', example: 37.6173 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng должен быть долготой в градусах (-180..180)' })
  lng!: number;

  @ApiPropertyOptional({ description: 'Точность GPS, м', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_ACCURACY_METERS)
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Скорость, м/с', example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_SPEED_MPS)
  speed?: number;

  @ApiPropertyOptional({ description: 'Уровень заряда батареи, %', example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  battery?: number;

  @ApiPropertyOptional({
    description: 'Время фиксации точки (ISO 8601). По умолчанию — момент приёма сервером.',
    example: '2026-09-15T10:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'timestamp должен быть датой ISO 8601' })
  timestamp?: string;
}

/** Batch-запрос приёма треков: мобильный клиент буферизует точки в оффлайне. */
export class TrackBatchDto {
  @ApiPropertyOptional({
    description:
      'ID сотрудника. По умолчанию берётся из токена (sub); подмена допустима только для ADMIN/SUPERVISOR.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId должен быть UUID' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Имя сотрудника для события geofence.exit (в токене не передаётся).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  employeeName?: string;

  @ApiProperty({ description: 'Точки трека', type: [TrackPointDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'tracks не может быть пустым' })
  @ArrayMaxSize(MAX_TRACK_BATCH, { message: `За один запрос не более ${MAX_TRACK_BATCH} точек` })
  @ValidateNested({ each: true })
  @Type(() => TrackPointDto)
  tracks!: TrackPointDto[];
}

/** GeoJSON-полигон: кольца из пар [lng, lat] (порядок как в PostGIS/GeoJSON). */
@ValidatorConstraint({ name: 'isGeoJsonPolygon', async: false })
export class IsGeoJsonPolygonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) {
      return false;
    }
    return value.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.length >= 4 &&
        ring.every(
          (position: unknown) =>
            Array.isArray(position) &&
            position.length === 2 &&
            position.every(
              (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
            ) &&
            (position[0] as number) >= -180 &&
            (position[0] as number) <= 180 &&
            (position[1] as number) >= -90 &&
            (position[1] as number) <= 90,
        ),
    );
  }

  defaultMessage(): string {
    return 'coordinates должны быть GeoJSON-полигоном: кольцо из ≥4 пар [lng, lat]';
  }
}

/** Проверяет, что значение — корректные координаты GeoJSON-полигона. */
export function IsGeoJsonPolygon(): PropertyDecorator {
  return Validate(IsGeoJsonPolygonConstraint);
}

export class GeofenceBoundaryDto {
  @ApiProperty({ description: 'Тип геометрии (поддерживается только Polygon)', enum: ['Polygon'] })
  @IsIn(['Polygon'], { message: "boundary.type должен быть 'Polygon'" })
  type!: 'Polygon';

  @ApiProperty({
    description: 'Кольца полигона: [[[lng, lat], [lng, lat], ...]] (первое — внешнее)',
    example: [
      [
        [37.6173, 55.7558],
        [37.6193, 55.7558],
        [37.6193, 55.7578],
        [37.6173, 55.7578],
        [37.6173, 55.7558],
      ],
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsGeoJsonPolygon()
  coordinates!: number[][][];
}

/** Создание геозоны объекта core (М3.1: привязка геозоны к objectId). */
export class CreateGeofenceDto {
  @ApiProperty({
    description: 'ID объекта в core-service',
    example: '3f1a5f9e-9a1e-4c6d-9a1e-000000000001',
  })
  @IsUUID('4', { message: 'objectId должен быть UUID' })
  objectId!: string;

  @ApiPropertyOptional({ description: 'Название геозоны', example: 'БЦ «Северный», корпус А' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: 'Граница геозоны (GeoJSON Polygon)', type: GeofenceBoundaryDto })
  @ValidateNested()
  @Type(() => GeofenceBoundaryDto)
  boundary!: GeofenceBoundaryDto;

  @ApiPropertyOptional({ description: 'Радиус вокруг объекта, м', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_GEOFENCE_RADIUS_METERS)
  radiusMeters?: number;
}

/** Координаты для проверок (query-параметры приходят строками → transform). */
export class CoordinatesQueryDto {
  @ApiProperty({ description: 'Широта', example: 55.7558 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat должен быть широтой в градусах (-90..90)' })
  lat!: number;

  @ApiProperty({ description: 'Долгота', example: 37.6173 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng должен быть долготой в градусах (-180..180)' })
  lng!: number;
}

/** ?lat=&lng= для GET /api/gps/geofences/:userId/check */
export class GeofenceCheckQueryDto extends CoordinatesQueryDto {}

/** ?objectId= для GET /api/gps/geofences (список геозон, нужен карте админки). */
export class GeofenceListQueryDto {
  @ApiPropertyOptional({
    description: 'Фильтр по объекту core-service',
    example: '3f1a5f9e-9a1e-4c6d-9a1e-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'objectId должен быть UUID' })
  objectId?: string;
}

/** ?lat=&lng=&radius= для GET /api/gps/employees/nearby */
export class NearbyEmployeesQueryDto extends CoordinatesQueryDto {
  @ApiPropertyOptional({ description: 'Радиус поиска, м (по умолчанию 500)', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_NEARBY_RADIUS_METERS)
  radius?: number = DEFAULT_NEARBY_RADIUS_METERS;
}

/** ?userId=&from=&to= для GET /api/gps/tracks (история перемещений) */
export class TrackHistoryQueryDto {
  @ApiProperty({ description: 'ID сотрудника' })
  @IsUUID('4', { message: 'userId должен быть UUID' })
  userId!: string;

  @ApiPropertyOptional({
    description: 'Начало периода (ISO 8601)',
    example: '2026-09-15T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'from должен быть датой ISO 8601' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Конец периода (ISO 8601)',
    example: '2026-09-15T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'to должен быть датой ISO 8601' })
  to?: string;

  @ApiPropertyOptional({ description: 'Максимум точек в ответе', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number;
}
