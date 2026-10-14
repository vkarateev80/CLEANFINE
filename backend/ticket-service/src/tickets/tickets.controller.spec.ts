import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

/**
 * Мок сервиса: контроллер обязан только прокинуть аргументы (@Body/@Param/@Query/@CurrentUser),
 * поэтому проверяем именно вызовы сервиса и метаданные роутов.
 */
const ticketsMock = {
  create: jest.fn(),
  createEmergency: jest.fn(),
  list: jest.fn(),
  getDetail: jest.fn(),
  changeStatus: jest.fn(),
  assign: jest.fn(),
  addComment: jest.fn(),
  completeOperation: jest.fn(),
  completeRoom: jest.fn(),
};

const USER: AuthUser = {
  id: 'u-admin',
  email: 'admin',
  role: 'ADMIN',
  fullName: '',
};

describe('TicketsController', () => {
  let controller: TicketsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: ticketsMock }],
    }).compile();
    controller = moduleRef.get(TicketsController);
  });

  it('create проксирует DTO и текущего пользователя', async () => {
    const dto = { type: 'planned', objectId: 'obj-1', description: 'Уборка' } as never;
    ticketsMock.create.mockResolvedValue('created');

    await expect(controller.create(dto, USER)).resolves.toBe('created');
    expect(ticketsMock.create).toHaveBeenCalledWith(dto, USER);
  });

  it('createEmergency проксирует DTO, пользователя и access-токен для gps-service', async () => {
    const dto = { objectId: 'obj-1', description: 'SOS', lat: 1, lng: 2 } as never;
    ticketsMock.createEmergency.mockResolvedValue('emergency');

    await expect(controller.createEmergency(dto, USER, 'token-abc')).resolves.toBe('emergency');
    expect(ticketsMock.createEmergency).toHaveBeenCalledWith(dto, USER, 'token-abc');
  });

  it('list проксирует фильтры и пагинацию', async () => {
    const query = { status: 'new', skip: 0, take: 10 } as never;
    ticketsMock.list.mockResolvedValue({ items: [], total: 0 });

    await expect(controller.list(query)).resolves.toEqual({ items: [], total: 0 });
    expect(ticketsMock.list).toHaveBeenCalledWith(query);
  });

  it('getById проксирует @Param id', async () => {
    ticketsMock.getDetail.mockResolvedValue('ticket');

    await expect(controller.getById('t-1')).resolves.toBe('ticket');
    expect(ticketsMock.getDetail).toHaveBeenCalledWith('t-1');
  });

  it('changeStatus передаёт id, статус и пользователя', async () => {
    const dto = { status: 'assigned' } as never;
    ticketsMock.changeStatus.mockResolvedValue('updated');

    await expect(controller.changeStatus('t-1', dto, USER)).resolves.toBe('updated');
    expect(ticketsMock.changeStatus).toHaveBeenCalledWith('t-1', dto, USER);
  });

  it('assign передаёт id, исполнителя и пользователя', async () => {
    const dto = { assigneeId: 'u-op' } as never;
    ticketsMock.assign.mockResolvedValue('assigned');

    await expect(controller.assign('t-1', dto, USER)).resolves.toBe('assigned');
    expect(ticketsMock.assign).toHaveBeenCalledWith('t-1', dto, USER);
  });

  it('addComment передаёт id, текст и автора', async () => {
    const dto = { text: 'Принято' } as never;
    ticketsMock.addComment.mockResolvedValue('comment');

    await expect(controller.addComment('t-1', dto, USER)).resolves.toBe('comment');
    expect(ticketsMock.addComment).toHaveBeenCalledWith('t-1', dto, USER);
  });

  it('completeOperation передаёт ticketId и operationId из пути (М3.6)', async () => {
    const dto = { photoUrl: 'http://files/p.jpg' } as never;
    ticketsMock.completeOperation.mockResolvedValue({ alreadyCompleted: false });

    await expect(controller.completeOperation('t-1', 'op-9', dto, USER)).resolves.toEqual({
      alreadyCompleted: false,
    });
    expect(ticketsMock.completeOperation).toHaveBeenCalledWith('t-1', 'op-9', dto, USER);
  });

  it('completeRoom передаёт ticketId и roomId из пути (М6.4)', async () => {
    const dto = { totalRooms: 3 } as never;
    ticketsMock.completeRoom.mockResolvedValue({ alreadyCompleted: true, roomId: 'room-1' });

    await expect(controller.completeRoom('t-1', 'room-1', dto, USER)).resolves.toEqual({
      alreadyCompleted: true,
      roomId: 'room-1',
    });
    expect(ticketsMock.completeRoom).toHaveBeenCalledWith('t-1', 'room-1', dto, USER);
  });

  it('роуты и RBAC объявлены там, где ожидает API-контракт', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TicketsController)).toBe('api/tickets');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.create)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.createEmergency)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, controller.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.getById)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.changeStatus)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.assign)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.addComment)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.completeOperation)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, controller.completeRoom)).toBe(RequestMethod.POST);

    expect(Reflect.getMetadata(PATH_METADATA, controller.createEmergency)).toBe('emergency');
    expect(Reflect.getMetadata(PATH_METADATA, controller.changeStatus)).toBe(':id/status');
    expect(Reflect.getMetadata(PATH_METADATA, controller.assign)).toBe(':id/assign');
    expect(Reflect.getMetadata(PATH_METADATA, controller.addComment)).toBe(':id/comments');
    expect(Reflect.getMetadata(PATH_METADATA, controller.completeOperation)).toBe(
      ':id/operations/:operationId/complete',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.completeRoom)).toBe(
      ':id/rooms/:roomId/complete',
    );

    // RBAC: назначает только админ/бригадир; статусы двигают и операторы;
    // чтение и комментарии — любому аутентифицированному; SOS — без ограничения ролей.
    expect(Reflect.getMetadata(ROLES_KEY, controller.create)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER', 'CLIENT']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.assign)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.changeStatus)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER', 'OPERATOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.completeOperation)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER', 'OPERATOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.createEmergency)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, controller.list)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, controller.getById)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, controller.addComment)).toBeUndefined();
  });
});
