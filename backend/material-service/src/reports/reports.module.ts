import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * Read-слой отчётов М7.1 (CQRS-read, решение архитектора №4).
 *
 * Отдельный модуль, а не часть `MaterialsModule`: у read-моделей свой провайдер
 * (`ReportsRepository`), своя точка входа (`ReportsController`) и своё правило
 * изменения — они читают SQL-представления, а не таблицы. `ReportsService`
 * экспортируется, потому что существующий `GET /api/materials/report` (М4.3)
 * обязан считаться по той же read-модели, а не второй реализацией поверх таблиц.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
