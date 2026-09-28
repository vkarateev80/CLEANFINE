import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  CheckInDto,
  CheckMissedQueryDto,
  CheckOutDto,
  CreateScheduleDto,
  GenerateQueryDto,
  ListEventsQueryDto,
  MyEventsQueryDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import { ScheduleService } from './schedule.service';
import { SchedulerService } from './scheduler.service';

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller('api/schedule')
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly scheduler: SchedulerService,
  ) {}

  // ------------------------------------------------------------------ графики

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать график (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'График создан' })
  @ApiResponse({ status: 400, description: 'Некорректное правило повторения' })
  async create(@Body() dto: CreateScheduleDto) {
    return this.schedule.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список графиков с числом смен' })
  async list() {
    return this.schedule.list();
  }

  @Get('events')
  @ApiOperation({
    summary: 'Смены на день с фильтрами (М4.4)',
    description:
      'date — "YYYY-MM-DD" (по умолчанию сегодня UTC), objectId — фильтр по объекту графика, ' +
      'userId — фильтр по исполнителю. Ответ — плоские смены с именем графика и ticketId.',
  })
  async events(@Query() query: ListEventsQueryDto) {
    return this.schedule.listEvents(query);
  }

  @Get('my')
  @ApiOperation({ summary: 'Мои смены (мобильное приложение/админка)' })
  async my(@CurrentUser() user: AuthUser, @Query() query: MyEventsQueryDto) {
    return this.schedule.listMyEvents(user.id, query);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Смена по id' })
  @ApiResponse({ status: 404, description: 'Смена не найдена' })
  async event(@Param('id') id: string) {
    return this.schedule.getEvent(id);
  }

  // --------------------------------------------------- check-in / check-out

  @Post('check-in')
  @Roles('OPERATOR', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({
    summary: 'Check-in на смену с проверкой геозоны (М4.5)',
    description:
      'Проверяет вхождение в геозону объекта через gps-service. Вне зоны — 403 ' +
      '«Вы находитесь вне зоны объекта»; gps-service недоступен — 502 (не 500). ' +
      'Повторный check-in идемпотентен и возвращает уже сохранённую отметку.',
  })
  @ApiResponse({ status: 201, description: 'Смена в статусе CHECKED_IN' })
  @ApiResponse({ status: 403, description: 'Вы находитесь вне зоны объекта' })
  @ApiResponse({ status: 404, description: 'Смена на сегодня не найдена' })
  @ApiResponse({ status: 502, description: 'Сервис геозон недоступен' })
  async checkIn(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckInDto,
    @AccessToken() token: string,
  ) {
    return this.schedule.checkIn(user.id, dto, token);
  }

  @Post('check-out')
  @Roles('OPERATOR', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({
    summary: 'Check-out: закрыть смену',
    description: 'Идемпотентен; без предварительного check-in — 400.',
  })
  @ApiResponse({ status: 201, description: 'Смена в статусе CHECKED_OUT' })
  @ApiResponse({ status: 400, description: 'Смена не открыта: сначала выполните check-in' })
  async checkOut(@CurrentUser() user: AuthUser, @Body() dto: CheckOutDto) {
    return this.schedule.checkOut(user.id, dto);
  }

  // ------------------------------------------------- детерминированные триггеры

  @Post('generate')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Сгенерировать смены на дату и плановые заявки (ADMIN)',
    description:
      'Детерминированный триггер для e2e и ручных прогонов. Идемпотентен: повторный вызов ' +
      'на ту же дату не создаёт ни смен, ни заявок; смены без заявки после сбоя ticket-service ' +
      'до-создаются. Необязательный scheduleId ограничивает проход одним графиком ' +
      '(несуществующий → 404) — так параллельные прогоны на общем стенде не мешают друг другу. ' +
      'Если ticket-service недоступен до записи смен — 502.',
  })
  @ApiResponse({ status: 201, description: 'Сводка: смены, заявки, пропуски' })
  @ApiResponse({ status: 404, description: 'График не найден' })
  @ApiResponse({ status: 502, description: 'ticket-service недоступен' })
  async generate(@Query() query: GenerateQueryDto) {
    // scope третьим аргументом: `now` подставляется сервисом, ручной триггер не задаёт время.
    return this.schedule.generateForDate(query.date, undefined, { scheduleId: query.scheduleId });
  }

  @Post('check-missed')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Прогнать проверку неявок и авто check-out вне расписания (ADMIN)',
    description:
      'Проверяет смены PLANNED с прошедшим plannedStart → MISSED + schedule.missed_checkin, ' +
      'и закрывает «зависшие» смены CHECKED_IN (SCHEDULE_AUTO_CHECKOUT_MINUTES). ' +
      'Необязательные scheduleId (только смены этого графика) и eventId (ровно одна смена; ' +
      'приоритетнее scheduleId и date) сужают проход — параллельные прогоны не влияют друг ' +
      'на друга. Несуществующий id → 404. Без параметров поведение прежнее: все смены.',
  })
  @ApiResponse({ status: 201, description: 'Сводка: неявки и закрытые смены' })
  @ApiResponse({ status: 404, description: 'График или смена не найдены' })
  async checkMissed(@Query() query: CheckMissedQueryDto) {
    return this.schedule.scanMissedAndAutoCheckout(query.date, undefined, {
      scheduleId: query.scheduleId,
      eventId: query.eventId,
    });
  }

  @Get('scheduler/state')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Состояние периодических проходов (ADMIN)' })
  async schedulerState() {
    return this.scheduler.getState();
  }

  // ------------------------------------------------------------------ правка

  @Get(':id')
  @ApiOperation({ summary: 'График по id' })
  @ApiResponse({ status: 404, description: 'График не найден' })
  async getById(@Param('id') id: string) {
    return this.schedule.getById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Изменить график (ADMIN, SUPERVISOR)' })
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedule.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Удалить график вместе со сменами (ADMIN, SUPERVISOR)' })
  async remove(@Param('id') id: string) {
    return this.schedule.remove(id);
  }
}
