import { Module } from '@nestjs/common';
import { FileServiceClient } from './file-service.client';
import { FloorItemController, FloorsController } from './floors.controller';
import { FloorsService } from './floors.service';

@Module({
  controllers: [FloorsController, FloorItemController],
  providers: [FloorsService, FileServiceClient],
  exports: [FloorsService],
})
export class FloorsModule {}
