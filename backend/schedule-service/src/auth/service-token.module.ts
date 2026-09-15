import { Global, Module } from '@nestjs/common';
import { ServiceTokenProvider } from './service-token.provider';

/** Служебный токен нужен и check-in (проброс), и cron-генерации заявок. */
@Global()
@Module({
  providers: [ServiceTokenProvider],
  exports: [ServiceTokenProvider],
})
export class ServiceTokenModule {}
