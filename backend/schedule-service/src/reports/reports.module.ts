import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * Read-слой отчётов schedule-service (М7.1, CQRS-read, решение архитектора №4).
 *
 * Отдельный модуль: у read-моделей свой репозиторий (читает SQL-представления) и своя
 * точка входа, а `ScheduleModule` остаётся write-моделью смен и отметок.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
