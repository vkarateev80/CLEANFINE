import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Read-эндпоинты отчётов М7.1 (CQRS-read).
 *
 * Отдельный контроллер от `TicketsController`: read-модель и state machine заявок не
 * должны правиться одним изменением. Роли не ограничиваем — как на остальных GET
 * ticket-service (М3.7): отчёты только читают, менять через них нечего.
 */
@ApiTags('tickets-reports')
@ApiBearerAuth('access-token')
@Controller('api/tickets/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('execution')
  @ApiOperation({
    summary: 'Выполнение заявок: количество, время цикла, просрочки',
    description:
      'Разрез «объект + тип» за период создания заявки, `series` — тот же поток по дням ' +
      '(график), `totals` — итоги и доля просрочек. Источник — read-модель ticket_execution_daily.',
  })
  @ApiResponse({ status: 200, description: 'TicketExecutionReportView' })
  async execution(@Query() query: ReportRangeQueryDto) {
    return this.reports.execution(query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'KPI заявок для дашборда',
    description:
      'Всего заявок, новые, в работе, выполненные, просроченные, аварийные, среднее время цикла ' +
      'и доля выполненных в срок.',
  })
  @ApiResponse({ status: 200, description: 'TicketSummaryView' })
  async summary() {
    return this.reports.summary();
  }
}
