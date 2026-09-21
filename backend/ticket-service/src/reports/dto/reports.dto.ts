import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

const ISO_OPTIONS = { strict: false } as const;

/** Фильтр отчётов М7.1: объект и период. */
export class ReportRangeQueryDto {
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
