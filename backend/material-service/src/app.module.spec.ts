/**
 * Сборка приложения целиком: проверяет, что композиция модулей (включая
 * глобальные AmqpModule/IntegrationModule) собирается без запуска брокера и БД.
 *
 * Консьюмер автосписания отключён через MATERIAL_CONSUMER_ENABLED=false, а URL
 * брокера указывает в пустоту: unit-тест не должен зависеть от RabbitMQ.
 * Переменные выставляются до инициализации ConfigModule (она ленивая и читает
 * process.env в момент сборки тестового модуля).
 */
process.env.MATERIAL_CONSUMER_ENABLED = 'false';
process.env.RABBITMQ_URL = 'amqp://127.0.0.1:1';

import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { MaterialsService } from './materials/materials.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule', () => {
  it('собирается с замоканными Prisma и сервисным слоем', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        material: {},
        materialStock: {},
        materialMovement: {},
        consumedOperation: {},
      })
      .overrideProvider(MaterialsService)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
    await moduleRef.close();
  });
});
