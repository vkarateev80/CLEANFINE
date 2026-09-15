import { Module } from '@nestjs/common';
import { GpsClient } from './gps.client';

@Module({
  providers: [GpsClient],
  exports: [GpsClient],
})
export class GpsModule {}
