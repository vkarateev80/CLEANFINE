import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GeofenceService } from './geofence.service';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';

@Module({
  imports: [EventsModule],
  controllers: [GpsController],
  providers: [GpsService, GeofenceService],
  exports: [GpsService, GeofenceService],
})
export class GpsModule {}
