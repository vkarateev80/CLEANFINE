import { Global, Module } from '@nestjs/common';
import { CoreMaterialsClient } from './core-materials.client';
import {
  ApiOperationMaterialsResolver,
  OPERATION_MATERIALS_RESOLVER,
  OperationMaterialsResolver,
} from './operation-materials.resolver';
import { ServiceTokenProvider } from './service-token.provider';
import { TicketsClient } from './tickets.client';

/**
 * Внутренние вызовы material-service: сервисный токен, клиенты ticket/core и
 * резолвер материалов операции. Глобальный — консьюмер автосписания берёт
 * резолвер по токену, не завися от конкретной реализации.
 */
@Global()
@Module({
  providers: [
    ServiceTokenProvider,
    TicketsClient,
    CoreMaterialsClient,
    ApiOperationMaterialsResolver,
    // Резолвер отдаётся по токену-абстракции: консьюмер не зависит от REST-реализации.
    { provide: OPERATION_MATERIALS_RESOLVER, useExisting: ApiOperationMaterialsResolver },
  ],
  exports: [
    ServiceTokenProvider,
    TicketsClient,
    CoreMaterialsClient,
    OPERATION_MATERIALS_RESOLVER,
  ],
})
export class IntegrationModule {}
