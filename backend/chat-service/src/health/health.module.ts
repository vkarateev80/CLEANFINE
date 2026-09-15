import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ChatsModule],
  controllers: [HealthController],
})
export class HealthModule {}
