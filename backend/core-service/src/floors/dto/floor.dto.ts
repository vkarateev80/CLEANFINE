import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** Верхняя граница int4 в PostgreSQL: Prisma упадёт 500 на записи большего значения. */
const INT4_MAX = 2147483647;

export class CreateFloorDto {
  @ApiProperty({ description: 'Номер этажа (уникален внутри объекта)', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(-5, { message: 'Номер этажа не может быть меньше -5 (подземные)' })
  @Max(200)
  number!: number;

  @ApiProperty({ description: 'Название этажа', example: 'Первый этаж' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название этажа' })
  name!: string;

  @ApiPropertyOptional({ description: 'Масштаб плана: метров в одном пикселе', example: 0.05 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  planScale?: number;
}

export class UpdateFloorDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-5)
  @Max(200)
  number?: number;

  @ApiPropertyOptional({ example: 'Второй этаж' })
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Масштаб плана. `null` (и историческое `''` от старых клиентов) — очистить;
   * отсутствие поля — не менять. @Type(() => Number) не используется: он
   * превращает `null` в 0, а `0` не проходит @Min — очистка была невозможна.
   */
  @ApiPropertyOptional({
    description: 'Масштаб плана; null — очистить',
    example: 0.05,
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === '') return null;
    return typeof value === 'number' ? value : Number(value);
  })
  @IsNumber({}, { message: 'Масштаб должен быть числом больше 0' })
  @Min(0.000001, { message: 'Масштаб должен быть больше 0' })
  planScale?: number | null;
}

/** Привязка уже загруженного в file-service плана к этажу. */
export class AttachPlanDto {
  @ApiProperty({ description: 'URL файла плана из file-service' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите planImageUrl' })
  planImageUrl!: string;

  @ApiPropertyOptional({ description: 'Масштаб плана: метров в одном пикселе', example: 0.05 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  planScale?: number;

  @ApiPropertyOptional({
    description: 'Ширина плана в пикселях (реальный размер изображения)',
    example: 1200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  planWidth?: number;

  @ApiPropertyOptional({
    description: 'Высота плана в пикселях (реальный размер изображения)',
    example: 800,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  planHeight?: number;
}
