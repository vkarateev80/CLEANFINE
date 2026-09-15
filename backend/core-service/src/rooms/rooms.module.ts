import { Module } from '@nestjs/common';
import { RoomItemController, RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController, RoomItemController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
