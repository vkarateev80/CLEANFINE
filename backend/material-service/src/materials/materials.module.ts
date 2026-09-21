import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { ReportsModule } from '../reports/reports.module';

/**
 * `ReportsModule` импортируется ради одной связи: `GET /api/materials/report` (М4.3)
 * теперь считается по read-модели отчётов (`ReportsService.consumptionByMaterial`),
 * а не вторым `groupBy` поверх таблиц движений. Двух реализаций одного агрегата быть
 * не должно — они разошлись бы при первой же правке.
 */
@Module({
  imports: [ReportsModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
