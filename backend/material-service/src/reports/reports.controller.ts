import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Read-эндпоинты отчётов М7.1 (CQRS-read).
 *
 * Контракт только на чтение: запись расхода остаётся в `MaterialsController`
 * (`POST /api/materials/movements`). Отдельный контроллер, а не ещё два метода в
 * `MaterialsController`, по той же причине, что и отдельный репозиторий: read-модель
 * и write-модель не должны правиться одним изменением.
 *
 * Роли не ограничиваем — как и на остальных GET material-service (М4.3): чтение
 * отчётов доступно всем авторизованным, менять данные через эти пути нельзя.
 */
@ApiTags('materials-reports')
@ApiBearerAuth('access-token')
@Controller('api/materials/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('consumption')
  @ApiOperation({
    summary: 'Отчёт по расходу: объект + период + материал',
    description:
      'Строки — разрез «объект + материал» за период, `series` — тот же расход по дням ' +
      '(график), `totals` — итоги. Источник — read-модель report_material_consumption_daily.',
  })
  @ApiResponse({ status: 200, description: 'ConsumptionReportView' })
  async consumption(@Query() query: ReportRangeQueryDto) {
    return this.reports.consumption(query);
  }

  @Get('consumption/by-object')
  @ApiOperation({
    summary: 'Расход по объектам и материалам за всё время',
    description:
      'Вторая таблица страницы «Отчёты»: разрез «объект + материал» без ограничения периода ' +
      '(read-модель report_material_consumption).',
  })
  @ApiResponse({ status: 200, description: '{ rows, totals }' })
  async byObject(@Query() query: ReportRangeQueryDto) {
    return this.reports.byObject(query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'KPI расхода для дашборда',
    description:
      'Расход и стоимость за последние 30 дней, число объектов с расходом, позиции ниже порога ' +
      'и топ-5 материалов по стоимости.',
  })
  @ApiResponse({ status: 200, description: 'ConsumptionSummaryView' })
  async summary() {
    return this.reports.summary();
  }
}
