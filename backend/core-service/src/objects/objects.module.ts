import { Module } from '@nestjs/common';
import { AuthServiceClient } from './auth-service.client';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';

@Module({
  controllers: [ObjectsController],
  providers: [ObjectsService, AuthServiceClient],
  exports: [ObjectsService],
})
export class ObjectsModule {}
