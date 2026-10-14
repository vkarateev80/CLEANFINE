import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  ChatMessagePushDto,
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdateSettingsDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * API уведомлений. Пользовательские эндпоинты работают только со своими данными:
 * userId берётся из JWT (request.user), а не из тела запроса. Исключение —
 * внутренний `internal/chat-message`: его вызывает chat-service, и получатели
 * перечислены в теле (доступ ограничен ролью ADMIN/SUPERVISOR).
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

  @Delete('device/:token')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Отписать push-токен устройства текущего пользователя (М6)',
    description: 'Вызывается при выходе. Чужой токен не трогается — 204 идемпотентно.',
  })
  @ApiResponse({ status: 204, description: 'Токен отписан (или его не было)' })
  @ApiResponse({ status: 401, description: 'Нет access-токена' })
  async unregisterDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.notifications.unregisterDevice(user.id, decodeURIComponent(token));
  }

  /**
   * Публичный ключ VAPID: по нему браузер создаёт push-подписку (PWA оператора,
   * админка). Без JWT — ключ не секрет, а запрос идёт до регистрации устройства.
   */
  @Get('web-push/public-key')
  @Public()
  @ApiOperation({ summary: 'Публичный ключ VAPID для Web Push (null — не настроен)' })
  @ApiResponse({ status: 200, description: '{ publicKey: string | null }' })
  webPushPublicKey() {
    return { publicKey: this.notifications.webPushPublicKey };
  }

  /** «Проверить push» в профиле: тестовое уведомление себе по всем каналам. */
  @Post('self-test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Тестовое уведомление текущему пользователю (push + in-app)' })
  @ApiResponse({ status: 200, description: '{ devices, notificationId }' })
  async selfTest(@CurrentUser() user: AuthUser) {
    return this.notifications.selfTest(user.id);
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

  /**
   * Внутренний эндпоинт для chat-service: push сообщения чата тем участникам,
   * у кого нет активного WebSocket-соединения. userId здесь не из JWT, а из тела:
   * вызывающая сторона — сервис, а не сам получатель. Защита — обычный JWT
   * (сервисный токен chat-service выписан служебной учётке ADMIN) плюс RBAC.
   */
  @Post('internal/chat-message')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiOperation({ summary: 'Внутренний: уведомить оффлайн-получателей о сообщении чата' })
  @ApiResponse({ status: 200, description: '{ delivered } — сколько получателей уведомлено' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации (пустой список получателей и т. п.)' })
  @ApiResponse({ status: 403, description: 'Нужна роль ADMIN или SUPERVISOR' })
  async pushChatMessage(@Body() dto: ChatMessagePushDto) {
    return this.notifications.notifyChatMessage(dto);
  }
}
