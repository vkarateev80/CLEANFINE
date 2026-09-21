import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

const ISO_OPTIONS = { strict: false } as const;

/** Фильтр отчёта по геозонам и маршрутам М7.1: период, объект, сотрудник. */
export class GeofenceControlQueryDto {
  @ApiPropertyOptional({ description: 'Объект (core-service); без него — по всем объектам' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Сотрудник (auth-service); без него — все сотрудники' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Начало периода (ISO 8601)' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO 8601)' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  to?: string;
}
