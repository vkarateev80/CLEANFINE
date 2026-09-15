import { Global, Module } from '@nestjs/common';
import { TicketClient } from './ticket.client';

@Global()
@Module({
  providers: [TicketClient],
  exports: [TicketClient],
})
export class TicketClientModule {}
