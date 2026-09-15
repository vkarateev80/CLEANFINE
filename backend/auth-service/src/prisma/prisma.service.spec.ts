import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('подключается на onModuleInit и отключается на onModuleDestroy', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('пробрасывает ошибку подключения (сервис не стартует без БД)', async () => {
    const service = new PrismaService();
    jest.spyOn(service, '$connect').mockRejectedValue(new Error("Can't reach database server"));

    await expect(service.onModuleInit()).rejects.toThrow(/reach database/);
  });
});
