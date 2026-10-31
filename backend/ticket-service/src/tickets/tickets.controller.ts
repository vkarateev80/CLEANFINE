import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  AssignTicketDto,
  CompleteOperationDto,
  CompleteRoomDto,
  CreateCommentDto,
  CreateTicketDto,
  EmergencyTicketDto,
  ListTicketsQueryDto,
  UpdateStatusDto,
  UpdateTicketDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('api/tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER', 'CLIENT')
  @ApiOperation({ summary: 'Создать плановую/внеплановую заявку (ADMIN, SUPERVISOR, CLIENT)' })
  @ApiResponse({ status: 201, description: 'Заявка создана (new или assigned)' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации' })
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.tickets.create(dto, user);
  }

  @Post('emergency')
  @ApiOperation({
    summary: 'Аварийная заявка (SOS): CRITICAL + ближние операторы + ticket.emergency',
    description:
      'Доступна всем аутентифицированным ролям (SOS отправляет оператор с мобильного). ' +
      'Недоступность gps-service не мешает созданию заявки: список ближних операторов будет пустым.',
  })
  @ApiResponse({
    status: 201,
    description: 'Заявка создана; nearbyOperators — найденные операторы',
  })
  async createEmergency(
    @Body() dto: EmergencyTicketDto,
    @CurrentUser() user: AuthUser,
    @AccessToken() token: string,
  ) {
    return this.tickets.createEmergency(dto, user, token);
  }

  @Get()
  @ApiOperation({ summary: 'Список заявок с фильтрами и пагинацией' })
  @ApiResponse({ status: 200, description: '{ items, total }' })
  async list(@Query() query: ListTicketsQueryDto) {
    return this.tickets.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Заявка по id: история назначений, комментарии, операции' })
  @ApiResponse({ status: 404, description: 'Заявка не найдена' })
  async getById(@Param('id') id: string) {
    return this.tickets.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Изменить заявку в любом статусе (только ADMIN)',
    description:
      'Приходят только изменённые поля. Статус можно выставить любой, в обход state machine: ' +
      'тайминги и дедлайны пересчитает сервис. Назначение на новую заявку переводит её в assigned, ' +
      'снятие исполнителя с назначенной — в new. Смена исполнителя пишется в историю назначений.',
  })
  @ApiResponse({ status: 200, description: 'Обновлённая заявка' })
  @ApiResponse({ status: 400, description: 'Статус не согласуется с исполнителем' })
  @ApiResponse({ status: 403, description: 'Роль не ADMIN' })
  @ApiResponse({ status: 404, description: 'Заявка не найдена' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Удалить заявку в любом статусе (только ADMIN)',
    description:
      'Каскадом удаляются назначения, комментарии и отметки о выполнении. Смена графика ' +
      'и движения материалов остаются: они хранят id заявки без внешнего ключа.',
  })
  @ApiResponse({ status: 204, description: 'Заявка удалена' })
  @ApiResponse({ status: 403, description: 'Роль не ADMIN' })
  @ApiResponse({ status: 404, description: 'Заявка не найдена' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.tickets.remove(id, user);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER', 'OPERATOR')
  @ApiOperation({
    summary: 'Сменить статус заявки (только валидные переходы state machine)',
    description:
      'Невалидный переход → 400 «Invalid status transition». Переход проставляет тайминги ' +
      '(acceptedAt/arrivedAt/completedAt/verifiedAt/closedAt) и дедлайны эскалации.',
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.changeStatus(id, dto, user);
  }

  @Post(':id/assign')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiOperation({ summary: 'Назначить исполнителя (ADMIN, SUPERVISOR) → ticket.assigned' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.assign(id, dto, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Добавить комментарий к заявке' })
  @ApiResponse({ status: 404, description: 'Заявка не найдена' })
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.addComment(id, dto, user);
  }

  @Post(':id/operations/:operationId/complete')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER', 'OPERATOR')
  @ApiOperation({
    summary: 'Отметить выполнение операции техкарты (М3.6)',
    description:
      'Идемпотентно по (operationId, roomId): повторный вызов не эмитит ticket.operation.completed. ' +
      'roomId входит в ключ — одна техкарта на несколько помещений маршрута. ' +
      'Если операция требует фото (requiresPhoto), без photoUrl — 400.',
  })
  @ApiResponse({
    status: 201,
    description: 'Операция зафиксирована (alreadyCompleted при повторе)',
  })
  async completeOperation(
    @Param('id') id: string,
    @Param('operationId') operationId: string,
    @Body() dto: CompleteOperationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.completeOperation(id, operationId, dto, user);
  }

  @Post(':id/rooms/:roomId/complete')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER', 'OPERATOR')
  @ApiOperation({
    summary: 'Отметить завершение помещения маршрута по заявке (М6.4)',
    description:
      'Идемпотентно по roomId: повторный вызов возвращает alreadyCompleted: true. ' +
      'До этого отметка жила только в мобильном приложении.',
  })
  @ApiResponse({
    status: 201,
    description: 'Помещение зафиксировано (alreadyCompleted при повторе)',
  })
  async completeRoom(
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() dto: CompleteRoomDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.completeRoom(id, roomId, dto, user);
  }
}
