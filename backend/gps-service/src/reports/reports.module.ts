import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * Read-слой отчётов gps-service (М7.1, CQRS-read, решение архитектора №4).
 *
 * Отдельный модуль: у read-моделей свой репозиторий (читает SQL-представления с
 * PostGIS-геометрией внутри) и своя точка входа, а `GpsModule` остаётся приёмом треков
 * и геозонами.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
