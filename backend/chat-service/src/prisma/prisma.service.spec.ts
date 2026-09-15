import { PrismaService } from './prisma.service';

/**
 * Prisma-клиент подключается к БД, поэтому проверяем только жизненный цикл
 * (onModuleInit/onModuleDestroy) — реальные запросы ломали бы юнит-тесты.
 */
describe('PrismaService (chat-service)', () => {
  it('подключается и отключается', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
