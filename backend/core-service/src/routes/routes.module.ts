import { Module } from '@nestjs/common';
import { FloorRoutesController, RoutePointsController, RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [FloorRoutesController, RoutesController, RoutePointsController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
