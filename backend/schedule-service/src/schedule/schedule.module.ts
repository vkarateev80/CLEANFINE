import { Module } from '@nestjs/common';
import { ScheduleSettingsService } from '../settings/schedule-settings.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { SchedulerService } from './scheduler.service';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService, SchedulerService, ScheduleSettingsService],
  exports: [ScheduleService, ScheduleSettingsService],
})
export class ScheduleModule {}
