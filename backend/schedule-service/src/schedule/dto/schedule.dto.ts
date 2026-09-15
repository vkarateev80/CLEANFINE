import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FREQUENCIES, type Frequency } from '../recurrence';

/**
 * Правило повторения графика.
 *
 * Ограничение «weekly требует days, monthly требует dayOfMonth» выражено в
 * ScheduleService (assertRecurrence), а не кастомным валидатором: там же собраны
 * остальные доменные проверки, и ошибка одинакова для create/patch.
 */
export class RecurrenceDto {
  @ApiProperty({ description: 'Частота', enum: FREQUENCIES, example: 'weekly' })
  @IsIn(FREQUENCIES as unknown as string[], {
    message: 'Частота: daily, weekly или monthly',
  })
  frequency!: Frequency;

  @ApiPropertyOptional({
    description: 'Дни недели для weekly (1=Пн … 7=Вс)',
    example: [1, 2, 3, 4, 5],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Для weekly укажите хотя бы один день недели' })
  @IsInt({ each: true, message: 'День недели — целое число 1..7' })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @Type(() => Number)
  days?: number[];

  @ApiPropertyOptional({
    description: 'Число месяца для monthly (1..31). Не задано → берётся days[0]',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Число месяца — целое 1..31' })
  @Min(1)
  @Max(31)
  @Type(() => Number)
  dayOfMonth?: number;

  @ApiProperty({ description: 'Время начала смены "HH:mm" (UTC)', example: '08:00' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите время начала смены' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  time!: string;
}

export class CreateScheduleDto {
  @ApiPropertyOptional({ description: 'Объект (core-service)', example: 'object-1' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Маршрут (core-service)' })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiProperty({ description: 'Название графика', example: 'Ежедневная уборка' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название графика' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Правило повторения', type: RecurrenceDto })
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence!: RecurrenceDto;

  @ApiProperty({
    description: 'Исполнители (auth-service); на каждого создаётся своя смена',
    example: ['e0f1…'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Укажите хотя бы одного исполнителя' })
  @IsString({ each: true })
  assignees!: string[];

  @ApiPropertyOptional({ description: 'Активен ли график', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Правка графика: все поля необязательны (М4.4). */
export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {}

/** GET /api/schedule/events — фильтры по дню/объекту/исполнителю. */
export class ListEventsQueryDto {
  @ApiPropertyOptional({ description: 'День "YYYY-MM-DD" (по умолчанию — сегодня UTC)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Объект' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Исполнитель' })
  @IsOptional()
  @IsString()
  userId?: string;
}

/** GET /api/schedule/my — смены текущего пользователя. */
export class MyEventsQueryDto {
  @ApiPropertyOptional({ description: 'Начало периода "YYYY-MM-DD"' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода "YYYY-MM-DD" (включительно)' })
  @IsOptional()
  @IsString()
  to?: string;
}

/** POST /api/schedule/check-in */
export class CheckInDto {
  @ApiProperty({ description: 'График, по которому оператор выходит на смену' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите график' })
  scheduleId!: string;

  @ApiProperty({ description: 'Широта', example: 55.7558 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Широта должна быть числом' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Долгота', example: 37.6173 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Долгота должна быть числом' })
  @Min(-180)
  @Max(180)
  lng!: number;
}

/** POST /api/schedule/check-out: координаты необязательны. */
export class CheckOutDto {
  @ApiProperty({ description: 'График, смену по которому закрываем' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите график' })
  scheduleId!: string;

  @ApiPropertyOptional({ description: 'Широта на момент закрытия' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Долгота на момент закрытия' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

/** POST /api/schedule/generate?date=YYYY-MM-DD — детерминированный триггер генерации. */
export class GenerateQueryDto {
  @ApiPropertyOptional({ description: 'Дата генерации "YYYY-MM-DD" (по умолчанию — сегодня)' })
  @IsOptional()
  @IsString()
  date?: string;
}

/** POST /api/schedule/check-missed?date=YYYY-MM-DD — ручной прогон проверки неявок. */
export class CheckMissedQueryDto {
  @ApiPropertyOptional({
    description: 'Дата проверки "YYYY-MM-DD" (по умолчанию — сегодня). null/пусто — все дни',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
