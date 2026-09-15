import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { SchedulerService } from './scheduler.service';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService, SchedulerService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
