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
  MaxLength,
  Min,
} from 'class-validator';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketPriority,
  type TicketStatus,
} from '@cleaning-ops/shared/types/tickets';

/** Типы, которые создаются обычным POST /api/tickets (аварийная — через /emergency). */
export const REGULAR_TICKET_TYPES = TICKET_TYPES.filter((type) => type !== 'emergency');

/** Плановая/внеплановая заявка (М3.4). */
export class CreateTicketDto {
  @ApiProperty({ description: 'Тип заявки', enum: REGULAR_TICKET_TYPES, example: 'planned' })
  @IsIn(REGULAR_TICKET_TYPES, { message: 'Тип заявки: planned или unscheduled' })
  type!: (typeof REGULAR_TICKET_TYPES)[number];

  @ApiPropertyOptional({ description: 'Приоритет', enum: TICKET_PRIORITIES, example: 'normal' })
  @IsOptional()
  @IsIn(TICKET_PRIORITIES, { message: 'Недопустимый приоритет заявки' })
  priority?: TicketPriority;

  @ApiProperty({ description: 'Объект (core-service)', example: '6f1c…' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите объект' })
  objectId!: string;

  @ApiPropertyOptional({ description: 'Помещение (core-service)' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Исполнитель: если задан, заявка сразу создаётся в статусе assigned',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiProperty({ description: 'Описание работ', example: 'Влажная уборка после ремонта' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите описание заявки' })
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ description: 'Широта (мобильное создание)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Долгота (мобильное создание)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

/** Аварийная заявка (SOS, М3.5). Приоритет всегда critical. */
export class EmergencyTicketDto {
  @ApiProperty({ description: 'Объект (core-service)' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите объект' })
  objectId!: string;

  @ApiPropertyOptional({ description: 'Помещение (core-service)' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty({ description: 'Что случилось', example: 'Прорыв трубы в санузле' })
  @IsString()
  @IsNotEmpty({ message: 'Опишите аварию' })
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ description: 'Широта места аварии' })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Долгота места аварии' })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({
    description: 'Название объекта для события ticket.emergency (пока не геокодируется из core)',
  })
  @IsOptional()
  @IsString()
  objectName?: string;

  @ApiPropertyOptional({ description: 'Этаж/помещение для события ticket.emergency' })
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional({ description: 'Радиус поиска ближних операторов, м', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  radiusM?: number;
}

/** Смена статуса (М3.4): только валидные переходы, иначе 400. */
export class UpdateStatusDto {
  @ApiProperty({ description: 'Новый статус', enum: TICKET_STATUSES })
  @IsIn(TICKET_STATUSES, { message: 'Недопустимый статус заявки' })
  status!: TicketStatus;
}

/** Назначение исполнителя (М3.4). */
export class AssignTicketDto {
  @ApiProperty({ description: 'Исполнитель (auth-service)' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите исполнителя' })
  assigneeId!: string;
}

/** Комментарий к заявке (М3.4). */
export class CreateCommentDto {
  @ApiProperty({ description: 'Текст комментария' })
  @IsString()
  @IsNotEmpty({ message: 'Комментарий не может быть пустым' })
  @MaxLength(4000)
  text!: string;
}

/** Завершение операции техкарты (М3.6). */
export class CompleteOperationDto {
  @ApiPropertyOptional({ description: 'Время завершения (ISO 8601); по умолчанию — сейчас' })
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'URL фото из file-service' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({
    description:
      'Операция требует фото (requiresPhoto в техкарте core): без photoUrl будет 400',
  })
  @IsOptional()
  requiresPhoto?: boolean;

  @ApiPropertyOptional({
    description:
      'Сколько всего операций у заявки — чтобы определить «все операции завершены». ' +
      'Первый вызов запоминает значение в заявке.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalOperations?: number;
}

/** Список заявок с фильтрами и пагинацией (М3.4). */
export class ListTicketsQueryDto {
  @ApiPropertyOptional({ description: 'Пропустить записей', example: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;

  @ApiPropertyOptional({ description: 'Взять записей (максимум 100)', example: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;

  @ApiPropertyOptional({ description: 'Фильтр по статусу', enum: TICKET_STATUSES })
  @IsOptional() @IsIn(TICKET_STATUSES) status?: TicketStatus;

  @ApiPropertyOptional({ description: 'Фильтр по типу', enum: TICKET_TYPES })
  @IsOptional() @IsIn(TICKET_TYPES) type?: (typeof TICKET_TYPES)[number];

  @ApiPropertyOptional({ description: 'Фильтр по приоритету', enum: TICKET_PRIORITIES })
  @IsOptional() @IsIn(TICKET_PRIORITIES) priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Фильтр по объекту' })
  @IsOptional() @IsString() objectId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по исполнителю' })
  @IsOptional() @IsString() assigneeId?: string;

  /**
   * Поиск по тексту заявки (М4.3): в модалке движения материала нужна конкретная
   * заявка, а селект показывает только последние 50. Пустая строка и отсутствие
   * параметра означают «без фильтра» — как в core/material/auth-service.
   */
  @ApiPropertyOptional({
    description: 'Поиск по id, описанию и объекту (без учёта регистра)',
    example: 'влажная уборка',
  })
  @IsOptional() @IsString() search?: string;
}
