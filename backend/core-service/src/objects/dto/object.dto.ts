import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OBJECT_STATUSES, type ObjectStatus } from '@cleaning-ops/shared/types/core';

/** Верхняя граница int4 в PostgreSQL: Prisma упадёт 500 на записи большего значения. */
const INT4_MAX = 2147483647;

export class CreateObjectDto {
  @ApiProperty({ description: 'Название объекта', example: 'БЦ «Северный», корпус А' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название объекта' })
  name!: string;

  @ApiProperty({ description: 'Адрес', example: 'г. Москва, ул. Ленинградская, 15' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите адрес' })
  address!: string;

  @ApiProperty({ description: 'Широта', example: 55.7558 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Долгота', example: 37.6173 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ description: 'Тип объекта', example: 'business-center' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите тип объекта' })
  type!: string;

  @ApiProperty({ description: 'Общая площадь, м²', example: 12500.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalArea!: number;

  @ApiProperty({ description: 'Количество этажей', example: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  floorsCount!: number;

  @ApiProperty({ description: 'Заказчик', example: 'ООО «Ромашка»' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите заказчика' })
  clientName!: string;

  @ApiProperty({ description: 'Контакт заказчика', example: '+7 495 000-00-00' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите контакт заказчика' })
  clientContact!: string;

  @ApiPropertyOptional({ description: 'Статус', enum: OBJECT_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(OBJECT_STATUSES, { message: 'Недопустимый статус объекта' })
  status?: ObjectStatus;
}

/** Частичное обновление: все поля необязательны. */
export class UpdateObjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() totalArea?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) floorsCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() clientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientContact?: string;

  @ApiPropertyOptional({ description: 'Статус', enum: OBJECT_STATUSES })
  @IsOptional()
  @IsIn(OBJECT_STATUSES, { message: 'Недопустимый статус объекта' })
  status?: ObjectStatus;
}

export class ListObjectsQueryDto {
  @ApiPropertyOptional({ description: 'Пропустить записей', example: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;

  @ApiPropertyOptional({ description: 'Взять записей (максимум 100)', example: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;

  @ApiPropertyOptional({ description: 'Фильтр по статусу', enum: OBJECT_STATUSES })
  @IsOptional() @IsIn(OBJECT_STATUSES) status?: ObjectStatus;

  @ApiPropertyOptional({ description: 'Фильтр по типу', example: 'business-center' })
  @IsOptional() @IsString() type?: string;

  @ApiPropertyOptional({ description: 'Поиск по названию, адресу и заказчику' })
  @IsOptional() @IsString() search?: string;
}
