import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { EventsPublisher } from './events/events.publisher';
import { GpsController } from './gps/gps.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule (gps-service)', () => {
  const saved = { ...process.env };

  afterAll(() => {
    // ConfigModule.forRoot читает корневой .env и подмешивает переменные в process.env;
    // возвращаем окружение, чтобы не влиять на другие спеки в том же процессе.
    process.env = { ...saved };
  });

  it('собирается целиком, подключая модули и глобальные guard-ы', async () => {
    const prismaMock = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);

    // Глобальные guard-ы объявлены через APP_GUARD: без них API остался бы открытым.
    const providers = Reflect.getMetadata('providers', AppModule) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining([
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ]),
    );

    // Стратегия поднимается вместе с модулем: без неё JwtAuthGuard отклонял бы всё.
    expect(moduleRef.get(JwtStrategy)).toBeInstanceOf(JwtStrategy);
    // Контроллер и паблишер событий зарегистрированы в графе зависимостей.
    expect(moduleRef.get(GpsController)).toBeInstanceOf(GpsController);
    expect(moduleRef.get(EventsPublisher)).toBeInstanceOf(EventsPublisher);
    // Prisma отдан моком — реального подключения к БД в unit-тесте нет.
    expect(moduleRef.get(PrismaService)).toBe(prismaMock);
  });
});
