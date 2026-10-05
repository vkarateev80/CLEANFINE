import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GeofenceControlQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Read-эндпоинты отчётов М7.1 (CQRS-read): контроль персонала по геозонам и маршрутам.
 *
 * Отдельный контроллер от `GpsController`: read-модель посещений и приём треков —
 * разные ответственности. Роли не ограничиваем — как на остальных GET gps-service
 * (М3.7): отчёты только читают.
 */
@ApiTags('gps-reports')
@ApiBearerAuth('access-token')
@Controller('api/gps/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('geofence-control')
  @ApiOperation({
    summary: 'Контроль персонала: посещения геозон и активность по маршруту',
    description:
      'Посещения объектов сотрудниками (`rows`, порог 5 минут отсекает транзит), ' +
      'активность по дням (`routes`: точки трека и посещённые объекты), ряд по дням (`series`) ' +
      'и итоги. Отметки смен (check-in/check-out) — в отчётах schedule-service.',
  })
  @ApiResponse({ status: 200, description: 'GeofenceControlReportView' })
  async geofenceControl(@Query() query: GeofenceControlQueryDto) {
    return this.reports.geofenceControl(query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'KPI контроля по GPS для доски действий',
    description: 'Посещения, время на объектах, число отслеживаемых сотрудников и точек трека.',
  })
  @ApiResponse({ status: 200, description: 'GeofenceSummaryView' })
  async summary() {
    return this.reports.summary();
  }
}
