import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications/notifications.service';
import { MockPushSender } from './notifications/push/mock-push.sender';
import { PUSH_SENDER } from './notifications/push/push-sender';
import { NotificationConsumer } from './notifications/rabbitmq/notification.consumer';
import { RabbitmqService } from './notifications/rabbitmq/rabbitmq.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule (notification-service)', () => {
  const saved = { ...process.env };

  afterAll(() => {
    // ConfigModule.forRoot читает корневой .env и подмешивает переменные в process.env;
    // возвращаем окружение, чтобы не влиять на другие спеки в том же процессе.
    process.env = { ...saved };
  });

  it('собирается целиком: guard-ы, консьюмер, push-адаптер и сервис уведомлений', async () => {
    const prismaMock = { $connect: jest.fn(), $disconnect: jest.fn() };
    // RabbitMQ подменяется: реального брокера в unit-тесте нет и быть не должно.
    const rabbitMock = { subscribe: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(RabbitmqService)
      .useValue(rabbitMock)
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
    expect(moduleRef.get(NotificationsService)).toBeInstanceOf(NotificationsService);
    expect(moduleRef.get(NotificationConsumer)).toBeInstanceOf(NotificationConsumer);

    // В dev FIREBASE_* пусты → обязателен мок-адаптер (решение №3).
    expect(moduleRef.get(PUSH_SENDER)).toBeInstanceOf(MockPushSender);

    // Глобальные guard-ы объявлены через APP_GUARD: без них API остался бы открытым.
    // APP_GUARD — мультипровайдер, поэтому читаем объявление модуля, а не get().
    const providers = Reflect.getMetadata('providers', AppModule) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining([
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ]),
    );

    // Стратегия поднимается вместе с модулем: без неё JwtAuthGuard отклонял бы всё.
    expect(moduleRef.get(JwtStrategy)).toBeInstanceOf(JwtStrategy);
    expect(moduleRef.get(PrismaService)).toBe(prismaMock);
  });
});
