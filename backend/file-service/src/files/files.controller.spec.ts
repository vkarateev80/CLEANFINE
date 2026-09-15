import type { AuthUser } from '../auth/guards/roles.guard';
import type { FilesService } from './files.service';
import { FilesController } from './files.controller';
import type { StorageService } from '../storage/storage.service';

const user: AuthUser = { id: 'u1', email: 'a@b.co', role: 'ADMIN', fullName: 'Админ' };

describe('FilesController', () => {
  let controller: FilesController;
  const files = {
    upload: jest.fn(),
    getById: jest.fn(),
    attach: jest.fn(),
    remove: jest.fn(),
    list: jest.fn(),
    listAttachments: jest.fn(),
  };
  const storage = { ping: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FilesController(
      files as unknown as FilesService,
      storage as unknown as StorageService,
    );
  });

  it('upload передаёт файл, метаданные и автора из токена', async () => {
    const file = { originalname: 'p.png' } as Express.Multer.File;
    files.upload.mockResolvedValue({ id: 'f1' });

    await controller.upload(file, { kind: 'photo' }, user);

    expect(files.upload).toHaveBeenCalledWith(file, { kind: 'photo' }, {
      id: 'u1',
      fullName: 'Админ',
    });
  });

  it('list применяет значения по умолчанию', async () => {
    files.list.mockResolvedValue({ items: [], total: 0 });
    await controller.list(0, 50);
    expect(files.list).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      bucket: undefined,
      entityType: undefined,
      entityId: undefined,
      uploadedById: undefined,
    });
  });

  it('list пробрасывает все фильтры', async () => {
    files.list.mockResolvedValue({ items: [], total: 0 });
    await controller.list(10, 5, 'PHOTOS', 'TICKET', 'e1', 'u1');
    expect(files.list).toHaveBeenCalledWith({
      skip: 10,
      take: 5,
      bucket: 'PHOTOS',
      entityType: 'TICKET',
      entityId: 'e1',
      uploadedById: 'u1',
    });
  });

  it('getById делегирует в сервис', async () => {
    files.getById.mockResolvedValue({ id: 'f1' });
    await expect(controller.getById('f1')).resolves.toEqual({ id: 'f1' });
  });

  it('attach делегирует в сервис', async () => {
    files.attach.mockResolvedValue({ id: 'a1' });
    const dto = { entityType: 'TICKET' as const, entityId: '00000000-0000-0000-0000-000000000001' };
    await expect(controller.attach('f1', dto)).resolves.toEqual({ id: 'a1' });
    expect(files.attach).toHaveBeenCalledWith('f1', dto);
  });

  it('listAttachments делегирует в сервис', async () => {
    files.listAttachments.mockResolvedValue([]);
    await controller.listAttachments('TICKET', 'e1');
    expect(files.listAttachments).toHaveBeenCalledWith('TICKET', 'e1');
  });

  it('remove возвращает void', async () => {
    files.remove.mockResolvedValue(undefined);
    await expect(controller.remove('f1')).resolves.toBeUndefined();
  });

  it('health сообщает статус MinIO', async () => {
    storage.ping.mockResolvedValue(true);
    await expect(controller.health()).resolves.toEqual({ status: 'ok', minio: 'ok' });
  });

  it('health сообщает, если MinIO недоступен', async () => {
    storage.ping.mockResolvedValue(false);
    await expect(controller.health()).resolves.toEqual({ status: 'ok', minio: 'unavailable' });
  });
});
