import { ParseIntPipe, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { TechCardsController, TechOperationsController } from './tech-cards.controller';
import { TechCardsService } from './tech-cards.service';

const techCardsMock = {
  create: jest.fn(),
  list: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addOperation: jest.fn(),
  reorderOperations: jest.fn(),
  updateOperation: jest.fn(),
  removeOperation: jest.fn(),
};

describe('TechCardsController (техкарты)', () => {
  let controller: TechCardsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TechCardsController],
      providers: [{ provide: TechCardsService, useValue: techCardsMock }],
    }).compile();
    controller = moduleRef.get(TechCardsController);
  });

  it('create проксирует DTO', async () => {
    const dto = { name: 'Влажная уборка' } as never;
    techCardsMock.create.mockResolvedValue('card');

    await expect(controller.create(dto)).resolves.toBe('card');
    expect(techCardsMock.create).toHaveBeenCalledWith(dto);
  });

  it('list собирает пагинацию и поиск в один объект', async () => {
    techCardsMock.list.mockResolvedValue({ items: [], total: 0 });

    await expect(controller.list(10, 25, 'уборка')).resolves.toEqual({ items: [], total: 0 });
    expect(techCardsMock.list).toHaveBeenCalledWith({ skip: 10, take: 25, search: 'уборка' });
  });

  it('list без поиска передаёт search = undefined', async () => {
    techCardsMock.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list(0, 50, undefined);

    expect(techCardsMock.list).toHaveBeenCalledWith({ skip: 0, take: 50, search: undefined });
  });

  it('getById отдаёт детализацию через getDetail', async () => {
    techCardsMock.getDetail.mockResolvedValue({ id: 'tc-1', totalEstimatedTimeMin: 15 });

    await expect(controller.getById('tc-1')).resolves.toEqual(
      expect.objectContaining({ totalEstimatedTimeMin: 15 }),
    );
    expect(techCardsMock.getDetail).toHaveBeenCalledWith('tc-1');
  });

  it('update передаёт id и тело', async () => {
    const dto = { name: 'Новое имя' } as never;
    techCardsMock.update.mockResolvedValue('updated');

    await expect(controller.update('tc-1', dto)).resolves.toBe('updated');
    expect(techCardsMock.update).toHaveBeenCalledWith('tc-1', dto);
  });

  it('remove не возвращает тело (204 ставит декоратор)', async () => {
    techCardsMock.remove.mockResolvedValue(undefined);

    await expect(controller.remove('tc-1')).resolves.toBeUndefined();
    expect(techCardsMock.remove).toHaveBeenCalledWith('tc-1');
  });

  it('addOperation передаёт id карточки и DTO операции', async () => {
    const dto = { name: 'Нанести средство', estimatedTimeMin: 10 } as never;
    techCardsMock.addOperation.mockResolvedValue('operation');

    await expect(controller.addOperation('tc-1', dto)).resolves.toBe('operation');
    expect(techCardsMock.addOperation).toHaveBeenCalledWith('tc-1', dto);
  });

  it('reorder передаёт id карточки и полный список operationIds', async () => {
    const dto = { operationIds: ['op-2', 'op-1'] } as never;
    techCardsMock.reorderOperations.mockResolvedValue([]);

    await expect(controller.reorder('tc-1', dto)).resolves.toEqual([]);
    expect(techCardsMock.reorderOperations).toHaveBeenCalledWith('tc-1', dto);
  });

  it('пагинация list объявлена с дефолтами 0/50 и ParseIntPipe', () => {
    // Клиент может не передать skip/take — контракт обязан подставить 0 и 50,
    // а строки из query превратить в числа (иначе Prisma получит "50").
    const argsMeta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TechCardsController, 'list') as Record<
      string,
      { index: number; pipes: unknown[] }
    >;
    const pipesByIndex = new Map(
      Object.values(argsMeta).map((arg) => [arg.index, arg.pipes] as const),
    );

    const skipPipes = pipesByIndex.get(0) as unknown[];
    const takePipes = pipesByIndex.get(1) as unknown[];

    expect((skipPipes[0] as { defaultValue: number }).defaultValue).toBe(0);
    // ParseIntPipe передан классом — Nest сам создаст экземпляр при обработке запроса.
    expect(skipPipes[1]).toBe(ParseIntPipe);
    expect((takePipes[0] as { defaultValue: number }).defaultValue).toBe(50);
    expect(takePipes[1]).toBe(ParseIntPipe);
    // search — обычная строка, пайпы ей не нужны.
    expect(pipesByIndex.get(2)).toEqual([]);
  });

  it('роуты и RBAC соответствуют контракту', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TechCardsController)).toBe('api/tech-cards');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.reorder)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(ROLES_KEY, controller.reorder)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.getById)).toBeUndefined();
  });
});

describe('TechOperationsController (операции техкарты)', () => {
  let controller: TechOperationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TechOperationsController],
      providers: [{ provide: TechCardsService, useValue: techCardsMock }],
    }).compile();
    controller = moduleRef.get(TechOperationsController);
  });

  it('update передаёт id операции и тело', async () => {
    const dto = { estimatedTimeMin: 12 } as never;
    techCardsMock.updateOperation.mockResolvedValue('operation');

    await expect(controller.update('op-1', dto)).resolves.toBe('operation');
    expect(techCardsMock.updateOperation).toHaveBeenCalledWith('op-1', dto);
  });

  it('remove удаляет операцию и пересобирает порядок', async () => {
    techCardsMock.removeOperation.mockResolvedValue(undefined);

    await expect(controller.remove('op-1')).resolves.toBeUndefined();
    expect(techCardsMock.removeOperation).toHaveBeenCalledWith('op-1');
  });

  it('роуты и RBAC: операции правят ADMIN и SUPERVISOR', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TechOperationsController)).toBe('api/tech-operations');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.update)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, controller.update)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN', 'SUPERVISOR']);
  });
});
