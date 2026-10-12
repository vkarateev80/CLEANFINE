import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Категории загрузки → бакеты MinIO (устав, п.1). */
export const UPLOAD_KINDS = ['photo', 'plan', 'avatar', 'document', 'chat'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const BUCKET_BY_KIND = {
  photo: 'photos',
  plan: 'plans',
  avatar: 'avatars',
  document: 'documents',
  // Вложения чата (12.10.2026): фото/видео/документы без водяного знака и
  // проверки разрешения — это переписка, а не фотоотчёт по операции.
  chat: 'documents',
} as const;

/** Разрешённые MIME по категориям (приёмка: JPEG/PNG/MP4; планы + PDF/SVG). */
export const ALLOWED_MIME: Record<UploadKind, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
  plan: ['image/png', 'image/jpeg', 'application/pdf', 'image/svg+xml'],
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  document: ['application/pdf', 'text/plain', 'application/octet-stream'],
  chat: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp',
    'application/pdf',
  ],
};

export const ENTITY_TYPES = ['FLOOR_PLAN', 'TICKET', 'CHAT_MESSAGE', 'AVATAR', 'DOCUMENT'] as const;
export type EntityTypeName = (typeof ENTITY_TYPES)[number];

/** Метаданные загрузки: для фото — автор, время и координаты водяного знака. */
export class UploadMetadataDto {
  @ApiProperty({ description: 'Категория загрузки', enum: UPLOAD_KINDS, example: 'photo' })
  @IsIn(UPLOAD_KINDS, { message: 'kind: ожидается photo | plan | avatar | document | chat' })
  kind!: UploadKind;

  @ApiPropertyOptional({ description: 'Имя сотрудника для водяного знака', example: 'Иванов Иван' })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ description: 'Когда сделан снимок (ISO 8601); по умолчанию — сейчас' })
  @IsOptional()
  @IsString()
  takenAt?: string;

  @ApiPropertyOptional({ description: 'Широта', example: 55.7558 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Долгота', example: 37.6173 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

/** Привязка файла к сущности другого сервиса (FK между сервисами не ставим). */
export class AttachFileDto {
  @ApiProperty({ description: 'Тип сущности', enum: ENTITY_TYPES, example: 'TICKET' })
  @IsIn(ENTITY_TYPES, { message: 'entityType: недопустимое значение' })
  entityType!: EntityTypeName;

  @ApiProperty({ description: 'UUID сущности в своём сервисе' })
  @IsUUID()
  entityId!: string;
}
