import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FilesService } from './files.service';
import { ImageService } from './image.service';

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
}

function multerFile(buffer: Buffer, mimetype: string, originalname: string): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: originalname,
    path: '',
    stream: undefined as never,
  };
}

describe('FilesService', () => {
  let service: FilesService;

  const prisma = {
    storedFile: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    fileAttachment: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = {
    putObject: jest.fn(),
    removeObject: jest.fn(),
    url: jest.fn((bucket: string, key: string) => `http://minio/${bucket}/${key}`),
  };

  const storedRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'f1',
    bucket: 'PHOTOS',
    objectKey: '2026/09/abc.jpg',
    originalName: 'photo.png',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 1600,
    height: 900,
    url: 'http://minio/photos/2026/09/abc.jpg',
    thumbnailUrl: 'http://minio/photos/2026/09/abc.jpg.thumb.jpg',
    thumbnailKey: '2026/09/abc.jpg.thumb.jpg',
    watermarked: true,
    uploadedById: 'u1',
    uploadedByName: 'Иванов Иван',
    takenAt: new Date(),
    lat: 55.75,
    lng: 37.61,
    createdAt: new Date('2026-09-14T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.storedFile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      storedRow({ ...data, id: 'f1' }),
    );
    service = new FilesService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      new ImageService(),
    );
  });

  describe('валидация файла', () => {
    it('требует файл', async () => {
      await expect(service.upload(undefined, { kind: 'photo' })).rejects.toThrow(
        'Файл не передан или пуст',
      );
    });

    it('отклоняет пустой файл', async () => {
      const empty = multerFile(Buffer.alloc(0), 'image/png', 'empty.png');
      empty.size = 0;
      await expect(service.upload(empty, { kind: 'photo' })).rejects.toThrow(BadRequestException);
    });

    it('отклоняет недопустимый MIME для категории', async () => {
      const file = multerFile(Buffer.from('txt'), 'text/plain', 'doc.txt');
      await expect(service.upload(file, { kind: 'photo' })).rejects.toThrow(/Недопустимый тип файла/);
    });

    it('отклоняет файл больше 10 МБ', async () => {
      const file = multerFile(Buffer.alloc(10), 'image/png', 'big.png');
      file.size = 11 * 1024 * 1024;
      await expect(service.upload(file, { kind: 'photo' })).rejects.toThrow(/превышает лимит/);
    });

    it('отклоняет фото ниже 1280×720', async () => {
      const file = multerFile(await makePng(640, 480), 'image/png', 'small.png');
      await expect(service.upload(file, { kind: 'photo' })).rejects.toThrow(/меньше минимального/);
    });

    it('отклоняет некорректный takenAt', async () => {
      const file = multerFile(await makePng(1600, 900), 'image/png', 'ok.png');
      await expect(
        service.upload(file, { kind: 'photo', takenAt: 'не-дата' }),
      ).rejects.toThrow(/ISO 8601/);
    });
  });

  describe('upload — фото', () => {
    it('накладывает водяной знак, делает миниатюру и пишет в MinIO', async () => {
      const file = multerFile(await makePng(1600, 900), 'image/png', 'Фото склада.png');

      const result = await service.upload(
        file,
        { kind: 'photo', userName: 'Иванов Иван', lat: 55.7558, lng: 37.6173 },
        { id: 'u1', fullName: 'Резервное Имя' },
      );

      // два объекта: оригинал (после водяного знака) и миниатюра
      expect(storage.putObject).toHaveBeenCalledTimes(2);
      const [bucketArg, keyArg, bodyArg, contentTypeArg] = storage.putObject.mock.calls[0];
      expect(bucketArg).toBe('photos');
      expect(keyArg).toMatch(/^2026\/09\/[0-9a-f-]+\.png$/);
      expect(contentTypeArg).toBe('image/jpeg');
      expect((await sharp(bodyArg as Buffer).metadata()).format).toBe('jpeg');

      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.watermarked).toBe(true);
      expect(created.width).toBe(1600);
      expect(created.height).toBe(900);
      expect(created.uploadedById).toBe('u1');
      expect(created.uploadedByName).toBe('Иванов Иван');
      expect(created.bucket).toBe('PHOTOS');

      expect(result.id).toBe('f1');
      expect(result.thumbnailUrl).toBeTruthy();
    });

    it('подставляет ФИО из токена, если userName не передан', async () => {
      const file = multerFile(await makePng(1280, 720), 'image/jpeg', 'p.jpg');
      await service.upload(file, { kind: 'photo' }, { id: 'u1', fullName: 'Петров Пётр' });
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.uploadedByName).toBe('Петров Пётр');
    });

    it('работает без автора (внутренние вызовы)', async () => {
      const file = multerFile(await makePng(1280, 720), 'image/jpeg', 'p.jpg');
      await service.upload(file, { kind: 'photo' });
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.uploadedById).toBeNull();
      expect(created.uploadedByName).toBe('Сотрудник');
    });

    it('не ставит водяной знак на видео и не пытается сделать миниатюру', async () => {
      const file = multerFile(Buffer.from('fake-mp4'), 'video/mp4', 'clip.mp4');
      await service.upload(file, { kind: 'photo' });

      // только оригинал, без миниатюры
      expect(storage.putObject).toHaveBeenCalledTimes(1);
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.watermarked).toBe(false);
      expect(created.thumbnailKey).toBeNull();
      expect(created.mimeType).toBe('video/mp4');
    });
  });

  describe('upload — план и документ', () => {
    it('план: без водяного знака, с миниатюрой-превью', async () => {
      const file = multerFile(await makePng(1200, 800), 'image/png', 'plan.png');
      await service.upload(file, { kind: 'plan' });

      expect(storage.putObject).toHaveBeenCalledTimes(2);
      const [bucketArg, , bodyArg] = storage.putObject.mock.calls[0];
      expect(bucketArg).toBe('plans');
      // оригинал не перекодируется, остаётся PNG
      expect((await sharp(bodyArg as Buffer).metadata()).format).toBe('png');
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.bucket).toBe('PLANS');
      expect(created.watermarked).toBe(false);
    });

    it('документ: сохраняется как есть, без миниатюры', async () => {
      const file = multerFile(Buffer.from('текст'), 'text/plain', 'акт.txt');
      await service.upload(file, { kind: 'document' });

      expect(storage.putObject).toHaveBeenCalledTimes(1);
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.bucket).toBe('DOCUMENTS');
      expect(created.thumbnailKey).toBeNull();
    });

    it('SVG-план: sharp растеризует его и делает превью', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#eee"/></svg>',
      );
      const file = multerFile(svg, 'image/svg+xml', 'schema.svg');
      await service.upload(file, { kind: 'plan' });

      // оригинал + миниатюра: sharp умеет растеризовать SVG
      expect(storage.putObject).toHaveBeenCalledTimes(2);
      const created = prisma.storedFile.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(created.width).toBe(100);
      expect(created.height).toBe(100);
      // водяной знак на планы не накладывается
      expect(created.watermarked).toBe(false);
    });
  });

  describe('getById', () => {
    it('возвращает представление файла', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(storedRow());
      const result = await service.getById('f1');
      expect(result.id).toBe('f1');
      expect(result.watermarked).toBe(true);
    });

    it('бросает NotFoundException', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('attach', () => {
    it('создаёт привязку к сущности', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(storedRow());
      prisma.fileAttachment.findFirst.mockResolvedValue(null);
      prisma.fileAttachment.create.mockResolvedValue({ id: 'a1' });

      const result = await service.attach('f1', {
        entityType: 'TICKET',
        entityId: '00000000-0000-0000-0000-000000000001',
      });

      expect(result).toEqual({ id: 'a1' });
      expect(prisma.fileAttachment.create).toHaveBeenCalledWith({
        data: {
          fileId: 'f1',
          entityType: 'TICKET',
          entityId: '00000000-0000-0000-0000-000000000001',
        },
      });
    });

    it('идемпотентен: повторная привязка не создаёт дубль', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(storedRow());
      prisma.fileAttachment.findFirst.mockResolvedValue({ id: 'a1' });

      const result = await service.attach('f1', {
        entityType: 'TICKET',
        entityId: '00000000-0000-0000-0000-000000000001',
      });

      expect(result).toEqual({ id: 'a1' });
      expect(prisma.fileAttachment.create).not.toHaveBeenCalled();
    });

    it('не привязывает несуществующий файл', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(null);
      await expect(
        service.attach('missing', {
          entityType: 'TICKET',
          entityId: '00000000-0000-0000-0000-000000000001',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('удаляет метаданные и объекты в MinIO (оригинал + миниатюра)', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(storedRow());
      prisma.storedFile.delete.mockResolvedValue(storedRow());

      await service.remove('f1');

      expect(prisma.storedFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
      expect(storage.removeObject).toHaveBeenCalledTimes(2);
      expect(storage.removeObject).toHaveBeenCalledWith('photos', '2026/09/abc.jpg');
      expect(storage.removeObject).toHaveBeenCalledWith('photos', '2026/09/abc.jpg.thumb.jpg');
    });

    it('не падает, если MinIO недоступен: метаданные уже удалены', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(storedRow());
      prisma.storedFile.delete.mockResolvedValue(storedRow());
      storage.removeObject.mockRejectedValue(new Error('MinIO недоступен'));

      await expect(service.remove('f1')).resolves.toBeUndefined();
    });

    it('бросает NotFoundException для несуществующего файла', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('возвращает элементы и общее количество', async () => {
      prisma.$transaction.mockResolvedValue([[storedRow()], 1]);
      const result = await service.list({});
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('ограничивает take значением 100', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({ take: 500 });
      const args = prisma.storedFile.findMany.mock.calls[0][0] as { take: number };
      expect(args.take).toBe(100);
    });

    it('фильтрует по привязке к сущности', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({ entityType: 'TICKET', entityId: 'e1' });
      const args = prisma.storedFile.findMany.mock.calls[0][0] as {
        where: { attachments?: unknown };
      };
      expect(args.where.attachments).toEqual({
        some: { entityType: 'TICKET', entityId: 'e1' },
      });
    });

    it('без фильтров по привязке не добавляет условие attachments', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({ bucket: 'PHOTOS' });
      const args = prisma.storedFile.findMany.mock.calls[0][0] as {
        where: { attachments?: unknown; bucket?: string };
      };
      expect(args.where.attachments).toBeUndefined();
      expect(args.where.bucket).toBe('PHOTOS');
    });
  });

  describe('listAttachments', () => {
    it('возвращает файлы вложений в порядке добавления', async () => {
      prisma.fileAttachment.findMany.mockResolvedValue([{ file: storedRow() }]);
      const result = await service.listAttachments('TICKET', 'e1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f1');
      expect(prisma.fileAttachment.findMany).toHaveBeenCalledWith({
        where: { entityType: 'TICKET', entityId: 'e1' },
        include: { file: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
