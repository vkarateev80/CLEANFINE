import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
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
