import { PrismaService } from './prisma.service';

describe('PrismaService (ticket-service)', () => {
  it('подключается и отключается в хуках жизненного цикла', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('пробрасывает ошибку подключения', async () => {
    const service = new PrismaService();
    jest.spyOn(service, '$connect').mockRejectedValue(new Error('P1001'));

    await expect(service.onModuleInit()).rejects.toThrow('P1001');
  });
});
