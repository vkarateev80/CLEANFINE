import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Верхняя граница int4 в PostgreSQL: Prisma упадёт 500 на записи большего значения. */
const INT4_MAX = 2147483647;

export class CreateRoomDto {
  @ApiProperty({ description: 'Название помещения', example: 'Санузел 101' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название помещения' })
  name!: string;

  @ApiProperty({ description: 'Площадь, м² (должна быть больше 0)', example: 12.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Площадь должна быть больше 0' })
  areaM2!: number;

  @ApiProperty({ description: 'Тип помещения', example: 'sanitary' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите тип помещения' })
  floorType!: string;

  @ApiPropertyOptional({ description: 'Координата X на плане (пиксели)', example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  coordsX?: number;

  @ApiPropertyOptional({ description: 'Координата Y на плане (пиксели)', example: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  coordsY?: number;

  @ApiPropertyOptional({ description: 'Ширина области на плане', example: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  coordsWidth?: number;

  @ApiPropertyOptional({ description: 'Высота области на плане', example: 140 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  coordsHeight?: number;

  @ApiPropertyOptional({ description: 'Зона уборки', example: 'A' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'Техкарта помещения (М2.6)', example: null })
  @IsOptional()
  @IsUUID()
  techCardId?: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) areaM2?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() floorType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  coordsX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  coordsY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  coordsWidth?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  coordsHeight?: number;
  /**
   * Зона уборки: `null` или `''` — очистить, отсутствие поля — не менять
   * (пустая строка приходит из web-admin, null — из API-клиентов).
   */
  @ApiPropertyOptional({
    description: 'Зона уборки; null или пустая строка — очистить',
    example: 'A',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  zone?: string | null;

  /** null отвязывает техкарту; отсутствие поля — не менять. */
  @ApiPropertyOptional({ description: 'Техкарта помещения; null — отвязать', nullable: true })
  @IsOptional()
  @IsUUID()
  techCardId?: string | null;
}
