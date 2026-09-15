import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { EscalationService } from './escalation.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [GpsModule],
  controllers: [TicketsController],
  providers: [TicketsService, EscalationService],
  exports: [TicketsService, EscalationService],
})
export class TicketsModule {}
