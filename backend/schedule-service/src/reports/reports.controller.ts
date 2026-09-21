import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StaffControlQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Read-эндпоинты отчётов М7.1 (CQRS-read).
 *
 * Отдельный контроллер от `ScheduleController`: read-модель смен и операции над сменами
 * (check-in/check-out, генерация, неявки) не должны правиться одним изменением. Роли не
 * ограничиваем — как на остальных GET schedule-service (М4.6): чтение открыто всем
 * авторизованным, менять через эти пути нечего.
 */
@ApiTags('schedule-reports')
@ApiBearerAuth('access-token')
@Controller('api/schedule/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('staff-control')
  @ApiOperation({
    summary: 'Контроль персонала: check-in/check-out, явки, опоздания, длительность смен',
    description:
      'Сводка по сотрудникам за период (`rows`), разрез «сотрудник + объект» (`byObject`), ' +
      'ряд по дням (`series`) и итоги. Геозоны и маршруты — в отчётах gps-service: ' +
      'у каждого сервиса своя БД.',
  })
  @ApiResponse({ status: 200, description: 'StaffControlReportView' })
  async staffControl(@Query() query: StaffControlQueryDto) {
    return this.reports.staffControl(query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'KPI контроля персонала для дашборда',
    description: 'Смены, отметки, неявки, авто-закрытия, опоздания, отработанные часы и явка.',
  })
  @ApiResponse({ status: 200, description: 'StaffSummaryView' })
  async summary() {
    return this.reports.summary();
  }
}
