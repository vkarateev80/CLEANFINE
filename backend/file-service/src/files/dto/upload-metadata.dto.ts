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
  document: [
    'application/pdf',
    'text/plain',
    'application/octet-stream',
    // XML-документы (12.10.2026): выгрузки из сторонних систем.
    'application/xml',
    'text/xml',
  ],
  // Чат (14.10.2026, «перекидывать фото и другие файлы»): любые рабочие файлы —
  // изображения, видео, аудио, офисные документы, архивы и неизвестные типы
  // (`application/octet-stream` браузер ставит .dwg, .xlsb и т.п.). Опасные
  // расширения отсекаются отдельно (`BLOCKED_EXTENSIONS`): html/svg могли бы
  // выполнить скрипт с нашего домена, exe/bat — на компьютере получателя.
  chat: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp',
    'video/x-msvideo',
    'video/x-matroska',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'application/pdf',
    'application/xml',
    'text/xml',
    'text/plain',
    'text/csv',
    'text/rtf',
    'application/rtf',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/gzip',
    'application/octet-stream',
  ],
};

/**
 * Расширения, которые нельзя прикреплять в чат и документы ни под каким MIME:
 * исполняемые файлы и скрипты, а также html/svg — файлы отдаются с нашего
 * домена, и такой «документ» выполнил бы скрипт в контексте сайта.
 */
export const BLOCKED_EXTENSIONS = [
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.ps1', '.sh', '.bash',
  '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.jar', '.php', '.phtml', '.cgi',
  '.html', '.htm', '.xhtml', '.svg', '.svgz', '.hta', '.dll', '.so', '.dmg', '.app',
] as const;

export function isBlockedExtension(originalName: string): boolean {
  const lower = originalName.toLowerCase();
  return BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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
