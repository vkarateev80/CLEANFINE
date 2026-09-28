import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MOVEMENT_TYPES, type MovementType } from '@cleaning-ops/shared/types/materials';

const ISO_OPTIONS = { strict: false } as const;

export class CreateMaterialDto {
  @ApiProperty({ description: 'Название материала', example: 'Средство для мытья полов' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название материала' })
  name!: string;

  @ApiProperty({ description: 'Единица измерения', example: 'л' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите единицу измерения' })
  unit!: string;

  @ApiProperty({ description: 'Норма расхода по умолчанию', example: 0.05 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultConsumption!: number;

  @ApiProperty({ description: 'Порог минимального остатка (ниже — material.low)', example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStockThreshold!: number;

  @ApiProperty({ description: 'Цена за единицу', example: 320.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerUnit!: number;

  @ApiPropertyOptional({ description: 'Поставщик', example: 'ООО «Химторг»' })
  @IsOptional()
  @IsString()
  supplier?: string;
}

/** Частичное обновление: все поля необязательны. */
export class UpdateMaterialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultConsumption?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costPerUnit?: number;
  @ApiPropertyOptional({ description: 'Поставщик', nullable: true })
  @IsOptional()
  @IsString()
  supplier?: string | null;
}

export class ListMaterialsQueryDto {
  @ApiPropertyOptional({ description: 'Пропустить записей', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Взять записей (максимум 100)', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ description: 'Поиск по названию и поставщику' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class StocksQueryDto {
  @ApiPropertyOptional({
    description: 'Объект (core-service); без него — остатки по всем объектам',
  })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({
    description: 'true — вернуть только позиции ниже порога minStockThreshold',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  onlyLow?: boolean;
}

export class CreateMovementDto {
  @ApiProperty({ description: 'Материал (material-service)' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите материал' })
  materialId!: string;

  @ApiProperty({ description: 'Объект (core-service), по которому движется материал' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите объект' })
  objectId!: string;

  @ApiProperty({ description: 'Тип движения', enum: MOVEMENT_TYPES, example: 'IN' })
  @IsIn(MOVEMENT_TYPES, { message: 'Тип движения: IN, OUT, TRANSFER или WRITE_OFF' })
  type!: MovementType;

  @ApiProperty({ description: 'Количество (> 0)', example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001, { message: 'Количество должно быть больше 0' })
  quantity!: number;

  @ApiPropertyOptional({ description: 'Объект-получатель; обязателен для TRANSFER' })
  @IsOptional()
  @IsString()
  targetObjectId?: string;

  @ApiPropertyOptional({ description: 'Заявка (ticket-service), если движение связано с работой' })
  @IsOptional()
  @IsString()
  ticketId?: string;
}

export class MovementsQueryDto {
  @ApiPropertyOptional({ description: 'Фильтр по объекту (core-service)' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Начало периода (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO 8601; дата без времени = конец суток)' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  to?: string;

  @ApiPropertyOptional({ description: 'Максимум записей (по умолчанию 100)', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Объект (core-service); без него — по всем объектам' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Начало периода (ISO 8601)' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO 8601; дата без времени = конец суток)' })
  @IsOptional()
  @IsISO8601(ISO_OPTIONS)
  to?: string;
}
