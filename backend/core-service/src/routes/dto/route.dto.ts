import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ROUTE_STATUSES, type RouteStatus } from '@cleaning-ops/shared/types/core';

/** Верхняя граница int4 в PostgreSQL: Prisma упадёт 500 на записи большего значения. */
const INT4_MAX = 2147483647;

export class CreateRouteDto {
  @ApiProperty({ description: 'Название маршрута', example: 'Утренняя уборка, 1 этаж' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название маршрута' })
  name!: string;
}

export class UpdateRouteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional({ description: 'Статус маршрута', enum: ROUTE_STATUSES })
  @IsOptional()
  @IsIn(ROUTE_STATUSES, { message: 'Недопустимый статус маршрута' })
  status?: RouteStatus;
}

export class AddRoutePointDto {
  @ApiProperty({ description: 'Помещение маршрута' })
  @IsUUID()
  roomId!: string;

  @ApiPropertyOptional({ description: 'Нормативное время на точку, мин', example: 8 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) estimatedTimeMin?: number;
}

export class UpdateRoutePointDto {
  @ApiPropertyOptional({ description: 'Нормативное время на точку, мин', example: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) estimatedTimeMin?: number;
}

/**
 * Переупорядочивание точек: передаётся ПОЛНЫЙ список id в нужном порядке.
 * Частичный список отклоняется — иначе легко потерять точки маршрута.
 */
export class ReorderPointsDto {
  @ApiProperty({
    description: 'Идентификаторы точек маршрута в новом порядке (полный список)',
    type: [String],
    example: ['point-3', 'point-1', 'point-2'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'pointIds не может быть пустым' })
  @ArrayUnique({ message: 'pointIds содержит дубликаты' })
  @IsUUID('all', { each: true, message: 'pointIds должны быть UUID' })
  pointIds!: string[];
}
