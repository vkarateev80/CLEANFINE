import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Верхняя граница int4 в PostgreSQL: Prisma упадёт 500 на записи большего значения. */
const INT4_MAX = 2147483647;

export class CreateTechCardDto {
  @ApiProperty({ description: 'Название техкарты', example: 'Влажная уборка санузла' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название техкарты' })
  name!: string;
}

export class UpdateTechCardDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
}

export class OperationMaterialDto {
  @ApiProperty({
    description:
      'Идентификатор материала из справочника material-service (М4). Межсервисного FK нет: ' +
      'core хранит строку и существование материала не проверяет — выбор из справочника ' +
      'обеспечивает UI, а списание выполняет material-service.',
    example: 'material-001',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите materialId' })
  materialId!: string;

  @ApiProperty({ description: 'Расход на операцию', example: 0.05 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001, { message: 'Расход должен быть больше 0' })
  consumptionPerOperation!: number;

  @ApiProperty({ description: 'Единица измерения', example: 'л' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите единицу измерения' })
  unit!: string;
}

export class CreateOperationDto {
  @ApiProperty({ description: 'Название операции', example: 'Нанести чистящее средство' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название операции' })
  name!: string;

  @ApiPropertyOptional({ description: 'Порядок выполнения; по умолчанию — в конец', example: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(INT4_MAX) orderIndex?: number;

  @ApiPropertyOptional({ description: 'Описание операции' })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({
    description: 'Оборудование и инвентарь (произвольный JSON); null — сбросить',
    example: { items: ['швабра', 'ведро'], ppe: ['перчатки'] },
    nullable: true,
  })
  @IsOptional() @IsObject() equipment?: Record<string, unknown> | null;

  @ApiProperty({ description: 'Нормативное время операции, мин', example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Время операции должно быть больше 0' })
  @Max(INT4_MAX)
  estimatedTimeMin!: number;

  @ApiPropertyOptional({ description: 'Требуется фотоотчёт', example: true })
  @IsOptional() @IsBoolean() requiresPhoto?: boolean;

  @ApiPropertyOptional({ description: 'Требуется сканирование QR', example: false })
  @IsOptional() @IsBoolean() requiresQr?: boolean;

  @ApiPropertyOptional({ description: 'Материалы операции', type: () => [OperationMaterialDto] })
  @IsOptional() @IsArray() materials?: OperationMaterialDto[];
}

export class UpdateOperationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(INT4_MAX) orderIndex?: number;
  @ApiPropertyOptional({ description: 'Описание операции' })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({
    description: 'Оборудование и инвентарь (произвольный JSON); null — сбросить',
    example: { items: ['швабра', 'ведро'], ppe: ['перчатки'] },
    nullable: true,
  })
  @IsOptional() @IsObject() equipment?: Record<string, unknown> | null;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) estimatedTimeMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresPhoto?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresQr?: boolean;

  /** Полная замена списка материалов операции. */
  @ApiPropertyOptional({ type: () => [OperationMaterialDto] })
  @IsOptional() @IsArray() materials?: OperationMaterialDto[];
}

/**
 * Переупорядочивание операций техкарты: полный список id в новом порядке.
 * Симметрично reorder точек маршрута (М2.5).
 */
export class ReorderOperationsDto {
  @ApiProperty({
    description: 'Идентификаторы операций в новом порядке (полный список)',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'operationIds не может быть пустым' })
  @ArrayUnique({ message: 'operationIds содержит дубликаты' })
  @IsUUID('all', { each: true, message: 'operationIds должны быть UUID' })
  operationIds!: string[];
}
