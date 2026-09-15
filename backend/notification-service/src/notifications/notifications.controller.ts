import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdateSettingsDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * API уведомлений. Все эндпоинты работают только со своими данными:
 * userId берётся из JWT (request.user), а не из тела запроса.
 */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('device')
  @HttpCode(200)
  @ApiOperation({ summary: 'Зарегистрировать/обновить push-токен устройства (upsert по token)' })
  @ApiResponse({ status: 200, description: 'Устройство зарегистрировано' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации' })
  async registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'In-app уведомления пользователя (пагинация, фильтр непрочитанных)' })
  @ApiResponse({ status: 200, description: '{ items, total, page, limit, unreadCount }' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Настройки подписок пользователя' })
  async getSettings(@CurrentUser() user: AuthUser) {
    return this.notifications.getSettings(user.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Обновить настройки подписок (список отключённых типов)' })
  @ApiResponse({ status: 400, description: 'Недопустимый тип уведомления' })
  async updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.notifications.updateSettings(user.id, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным (идемпотентно)' })
  @ApiResponse({ status: 200, description: 'Уведомление прочитано' })
  @ApiResponse({ status: 404, description: 'Уведомление не найдено' })
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
