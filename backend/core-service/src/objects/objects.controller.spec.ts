import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';

/**
 * DTO-файлы импортируют справочники статусов из workspace-пакета @cleaning-ops/shared,
 * которого нет в node_modules (он собирается в shared/dist), поэтому подменяем модуль
 * виртуальным моком с реальными значениями справочника.
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

/**
 * Мок сервиса: контроллер обязан только прокинуть аргументы, поэтому
 * проверяем именно вызов сервиса с нужными @Body/@Param/@Query.
 */
const objectsMock = {
  create: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ObjectsController', () => {
  let controller: ObjectsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ObjectsController],
      providers: [{ provide: ObjectsService, useValue: objectsMock }],
    }).compile();
    controller = moduleRef.get(ObjectsController);
  });

  it('create проксирует DTO в сервис', async () => {
    const dto = { name: 'БЦ' } as never;
    objectsMock.create.mockResolvedValue('created');

    await expect(controller.create(dto)).resolves.toBe('created');
    expect(objectsMock.create).toHaveBeenCalledWith(dto);
  });

  it('list проксирует query с пагинацией и фильтрами', async () => {
    const query = { skip: 5, take: 10, search: 'север' } as never;
    objectsMock.list.mockResolvedValue({ items: [], total: 0 });

    await expect(controller.list(query)).resolves.toEqual({ items: [], total: 0 });
    expect(objectsMock.list).toHaveBeenCalledWith(query);
  });

  it('getById проксирует @Param id', async () => {
    objectsMock.getById.mockResolvedValue('object');

    await expect(controller.getById('obj-1')).resolves.toBe('object');
    expect(objectsMock.getById).toHaveBeenCalledWith('obj-1');
  });

  it('getDetail проксирует @Param id', async () => {
    objectsMock.getDetail.mockResolvedValue({ id: 'obj-1', floors: [] });

    await expect(controller.getDetail('obj-1')).resolves.toEqual({ id: 'obj-1', floors: [] });
    expect(objectsMock.getDetail).toHaveBeenCalledWith('obj-1');
  });

  it('update передаёт и id, и тело', async () => {
    const dto = { status: 'PAUSED' } as never;
    objectsMock.update.mockResolvedValue('updated');

    await expect(controller.update('obj-1', dto)).resolves.toBe('updated');
    expect(objectsMock.update).toHaveBeenCalledWith('obj-1', dto);
  });

  it('remove возвращает undefined: 204 задаётся декоратором, а не телом ответа', async () => {
    objectsMock.remove.mockResolvedValue(undefined);

    await expect(controller.remove('obj-1')).resolves.toBeUndefined();
    expect(objectsMock.remove).toHaveBeenCalledWith('obj-1');
  });

  it('роуты и RBAC объявлены там, где ожидает API-контракт', () => {
    // Проверяем метаданные, а не реализацию: смена пути или потеря @Roles
    // ломает клиентов, оставаясь незамеченной в тестах сервиса.
    expect(Reflect.getMetadata(PATH_METADATA, ObjectsController)).toBe('api/objects');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.create)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.update)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, controller.create)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN']);
    // Чтение доступно всем аутентифицированным — @Roles на list/getById быть не должно.
    expect(Reflect.getMetadata(ROLES_KEY, controller.list)).toBeUndefined();
  });
});
