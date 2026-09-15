import { Module } from '@nestjs/common';
import { TechCardsController, TechOperationsController } from './tech-cards.controller';
import { TechCardsService } from './tech-cards.service';

@Module({
  controllers: [TechCardsController, TechOperationsController],
  providers: [TechCardsService],
  exports: [TechCardsService],
})
export class TechCardsModule {}
