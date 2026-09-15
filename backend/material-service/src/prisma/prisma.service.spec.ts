import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('подключается на старте и отключается на остановке', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const service = Object.create(PrismaService.prototype) as PrismaService;
    (service as unknown as { $connect: jest.Mock }).$connect = connect;
    (service as unknown as { $disconnect: jest.Mock }).$disconnect = disconnect;

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('PrismaModule отдаёт PrismaService глобально', async () => {
    const { PrismaModule } = await import('./prisma.module');
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(PrismaService)).toEqual({});
  });
});
