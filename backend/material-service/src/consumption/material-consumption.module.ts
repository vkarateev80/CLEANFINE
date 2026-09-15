import { Module } from '@nestjs/common';
import { MaterialsModule } from '../materials/materials.module';
import { MaterialConsumptionService } from './material-consumption.service';
import { MaterialsConsumer } from './materials.consumer';

/**
 * Автосписание по событию `ticket.operation.completed` (М4.2).
 * Резолвер материалов операции приходит из глобального IntegrationModule.
 */
@Module({
  imports: [MaterialsModule],
  providers: [MaterialConsumptionService, MaterialsConsumer],
  exports: [MaterialConsumptionService],
})
export class MaterialConsumptionModule {}
