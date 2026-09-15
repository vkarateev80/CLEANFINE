import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { PrismaService } from './prisma/prisma.service';

/**
 * DTO всех модулей импортируют справочники из workspace-пакета @cleaning-ops/shared,
 * которого нет в node_modules (он собирается в shared/dist), поэтому подменяем
 * модуль виртуальным моком с реальными значениями справочников.
 */
jest.mock(
  '@cleaning-ops/shared/types/core',
  () => ({
    OBJECT_STATUSES: ['ACTIVE', 'PAUSED', 'ARCHIVED'],
    ROUTE_STATUSES: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    canTransitionObject: () => true,
    canTransitionRoute: () => true,
  }),
  { virtual: true },
);

describe('AppModule', () => {
  const saved = { ...process.env };

  afterAll(() => {
    // ConfigModule.forRoot читает корневой .env и подмешивает переменные в process.env;
    // возвращаем окружение, чтобы не влиять на другие спеки в том же процессе.
    process.env = { ...saved };
  });

  it('собирается целиком, подключая все модули и глобальные guard-ы', async () => {
    const prismaMock = { $connect: jest.fn(), $disconnect: jest.fn() };
    const configMock = { get: jest.fn().mockReturnValue('secret') };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ConfigService)
      .useValue(configMock)
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);

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
    // Prisma отдан моком — реального подключения к БД в юнит-тесте нет.
    expect(moduleRef.get(PrismaService)).toBe(prismaMock);
  });
});
