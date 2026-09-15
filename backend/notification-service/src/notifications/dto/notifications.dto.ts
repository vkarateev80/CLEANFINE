import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  DEVICE_PLATFORMS,
  NOTIFICATION_TYPES,
  type DevicePlatform,
  type NotificationType,
} from '../notification-types';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'FCM-токен устройства',
    example: 'fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите токен устройства' })
  token!: string;

  @ApiProperty({ description: 'Платформа', enum: DEVICE_PLATFORMS, example: 'android' })
  @IsIn(DEVICE_PLATFORMS, { message: 'Недопустимая платформа' })
  platform!: DevicePlatform;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Страница (с 1)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Размер страницы (максимум 100)', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Только непрочитанные', example: true, default: false })
  @IsOptional()
  // Query приходит строкой: Boolean('false') === true, поэтому приводим явно.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Типы уведомлений, от которых пользователь отказывается',
    enum: NOTIFICATION_TYPES,
    isArray: true,
    example: ['MATERIAL_LOW'],
  })
  @IsArray()
  @IsIn(NOTIFICATION_TYPES, { each: true, message: 'Недопустимый тип уведомления' })
  disabledTypes!: NotificationType[];
}

/**
 * Тело внутреннего вызова chat-service: push сообщения чата оффлайн-получателям
 * (у кого нет активного WebSocket-соединения). Заголовок и текст приходят уже
 * готовыми, `data` — произвольные строковые поля для перехода в чат.
 */
export class ChatMessagePushDto {
  @ApiProperty({
    description: 'Получатели — id пользователей',
    type: [String],
    example: ['d8369dde-68c5-4f8b-ab72-55cd39497607'],
  })
  @IsArray()
  // Пустой список означает «некому доставлять» — это ошибка вызывающей стороны,
  // а не успешная рассылка нулю получателей.
  @ArrayNotEmpty({ message: 'Укажите хотя бы одного получателя' })
  @IsString({ each: true, message: 'Идентификатор получателя должен быть строкой' })
  @IsNotEmpty({ each: true, message: 'Идентификатор получателя не может быть пустым' })
  userIds!: string[];

  @ApiProperty({ description: 'Заголовок push (название чата)', example: 'Чат по заявке T-1' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите заголовок уведомления' })
  title!: string;

  @ApiProperty({ description: 'Текст push (превью сообщения)', example: 'Привет' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите текст уведомления' })
  body!: string;

  @ApiPropertyOptional({
    description: 'Данные уведомления: уходят в payload и push.data',
    example: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
  })
  @IsOptional()
  @IsObject({ message: 'data должен быть объектом' })
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Тип уведомления (проверяется: эндпоинт только про сообщения чата)',
    enum: ['CHAT_MESSAGE'],
    example: 'CHAT_MESSAGE',
  })
  @IsOptional()
  // Поле приходит от chat-service; принимаем его ради явности контракта, но не
  // даём этим эндпоинтом отправить уведомление другого типа.
  @IsIn(['CHAT_MESSAGE'], { message: 'Допустим только тип CHAT_MESSAGE' })
  type?: 'CHAT_MESSAGE';
}
