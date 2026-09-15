import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CHAT_TYPES, type ChatType } from '@cleaning-ops/shared/types/chat';

/** Ограничения сообщения/поиска — единые для REST и WebSocket. */
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENTS = 20;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_SEARCH_LIMIT = 50;

export class CreateChatDto {
  @ApiProperty({ description: 'Тип чата', enum: CHAT_TYPES, example: 'direct' })
  @IsIn(CHAT_TYPES, { message: 'Недопустимый тип чата' })
  type!: ChatType;

  @ApiPropertyOptional({
    description: 'Участники (userId из auth-service). Для direct — второй участник',
    type: [String],
    example: ['b3f1c2d4-0000-0000-0000-000000000002'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  participantIds?: string[];

  @ApiPropertyOptional({ description: 'Объект (core-service), только для type=object' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objectId?: string;

  @ApiPropertyOptional({ description: 'Заявка (ticket-service), только для type=ticket' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'Название чата (для object/system)', example: 'Офис на Ленина' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Текст сообщения', example: 'Добрый день, заявка принята' })
  @IsString()
  @IsNotEmpty({ message: 'Сообщение не может быть пустым' })
  @MaxLength(MAX_MESSAGE_LENGTH, { message: `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов` })
  text!: string;

  @ApiPropertyOptional({
    description: 'Id вложений (file-service, bucket documents)',
    type: [String],
    example: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class MarkReadDto {
  @ApiProperty({
    description: 'Последнее прочитанное сообщение чата (для direct/system — любой участник)',
    example: '6f1a2b3c-0000-0000-0000-000000000010',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите lastMessageId' })
  lastMessageId!: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description:
      'Верхняя граница страницы (ISO): вернуть сообщения строго раньше этого момента. ' +
      'Курсор для подгрузки истории вверх.',
    example: '2026-01-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'before должен быть датой ISO 8601' })
  before?: string;

  @ApiPropertyOptional({
    description: `Размер страницы (максимум ${MAX_PAGE_LIMIT})`,
    example: DEFAULT_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;
}

export class SearchMessagesQueryDto {
  @ApiProperty({ description: 'Строка поиска по тексту (регистронезависимо, ILIKE)', example: 'заявка' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите строку поиска' })
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({ description: 'Ограничить поиск одним чатом (должен быть своим)' })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({
    description: `Сколько результатов вернуть (максимум ${MAX_PAGE_LIMIT})`,
    example: DEFAULT_SEARCH_LIMIT,
    default: DEFAULT_SEARCH_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;
}
