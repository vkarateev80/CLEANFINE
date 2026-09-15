import { Global, Module } from '@nestjs/common';
import { GpsClient } from './gps.client';

@Global()
@Module({
  providers: [GpsClient],
  exports: [GpsClient],
})
export class GpsModule {}
