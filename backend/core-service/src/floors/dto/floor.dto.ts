import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  @IsOptional() @Type(() => Number) @IsInt() @Min(-5) @Max(200) number?: number;

  @ApiPropertyOptional({ example: 'Второй этаж' })
  @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional({ description: 'Масштаб плана', example: 0.05 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.000001) planScale?: number;
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

  @ApiPropertyOptional({ description: 'Ширина плана в пикселях (реальный размер изображения)', example: 1200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) planWidth?: number;

  @ApiPropertyOptional({ description: 'Высота плана в пикселях (реальный размер изображения)', example: 800 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) planHeight?: number;
}
