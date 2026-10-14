import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Bucket, EntityType, Prisma, StoredFile } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { MAX_FILE_SIZE_BYTES } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ImageService } from './image.service';
import {
  ALLOWED_MIME,
  BUCKET_BY_KIND,
  isBlockedExtension,
  type AttachFileDto,
  type UploadKind,
  type UploadMetadataDto,
} from './dto/upload-metadata.dto';

/** Ответ API по файлу (наружу отдаём camelCase-поля модели). */
export interface UploadedFileView {
  id: string;
  bucket: Bucket;
  objectKey: string;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  watermarked: boolean;
  createdAt: Date;
}

const BUCKET_ENUM: Record<UploadKind, Bucket> = {
  photo: 'PHOTOS',
  plan: 'PLANS',
  avatar: 'AVATARS',
  document: 'DOCUMENTS',
  chat: 'DOCUMENTS',
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
  ) {}

  /**
   * Загрузка файла (устав, п.2): валидация → (для фото) водяной знак и миниатюра →
   * MinIO → метаданные в БД.
   */
  async upload(
    file: Express.Multer.File | undefined,
    dto: UploadMetadataDto,
    uploader?: { id: string; fullName?: string },
  ): Promise<UploadedFileView> {
    this.assertFilePresent(file);
    const kind = dto.kind;
    const bucket = BUCKET_BY_KIND[kind];
    this.assertMime(kind, file!.mimetype);
    this.assertExtensionAllowed(kind, file!.originalname);
    this.assertSize(file!.size);

    const isImage = file!.mimetype.startsWith('image/');
    // sharp растеризует и растровые изображения, и SVG (при наличии резолвера),
    // поэтому размеры считаем для любого image/*; для видео inspect вернёт null.
    const dims = isImage ? await this.images.inspect(file!.buffer) : null;

    // Одно и то же имя уходит и в водяной знак, и в метаданные, иначе они расходятся.
    const displayName = dto.userName ?? uploader?.fullName ?? 'Сотрудник';

    let body = file!.buffer;
    let contentType = file!.mimetype;
    let watermarked = false;

    if (kind === 'photo' && dims) {
      // Водяной знак и минимальное разрешение — только для растровых фото.
      this.images.assertMinResolution(dims);
      body = await this.images.addWatermark(file!.buffer, {
        userName: displayName,
        takenAt: parseTakenAt(dto.takenAt),
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      });
      contentType = 'image/jpeg';
      watermarked = true;
    }

    const objectKey = buildObjectKey(file!.originalname, kind);
    await this.storage.putObject(bucket, objectKey, body, contentType);

    let thumbnailKey: string | null = null;
    if (dims) {
      const thumbnail = await this.images.generateThumbnail(body);
      thumbnailKey = `${objectKey}.thumb.jpg`;
      await this.storage.putObject(bucket, thumbnailKey, thumbnail, 'image/jpeg');
    }

    const created = await this.prisma.storedFile.create({
      data: {
        bucket: BUCKET_ENUM[kind],
        objectKey,
        originalName: file!.originalname,
        mimeType: contentType,
        sizeBytes: body.length,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        url: this.storage.url(bucket, objectKey),
        thumbnailUrl: thumbnailKey ? this.storage.url(bucket, thumbnailKey) : null,
        thumbnailKey,
        watermarked,
        uploadedById: uploader?.id ?? null,
        uploadedByName: displayName,
        takenAt: dto.takenAt ? parseTakenAt(dto.takenAt) : null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      },
    });

    return toView(created);
  }

  /** Метаданные файла по id. */
  async getById(id: string): Promise<UploadedFileView> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) {
      throw new NotFoundException('Файл не найден');
    }
    return toView(file);
  }

  /** Привязка файла к сущности другого сервиса (@@unique по паре файл+сущность). */
  async attach(fileId: string, dto: AttachFileDto): Promise<{ id: string }> {
    await this.getById(fileId);

    const existing = await this.prisma.fileAttachment.findFirst({
      where: {
        fileId,
        entityType: dto.entityType as EntityType,
        entityId: dto.entityId,
      },
    });
    if (existing) {
      return { id: existing.id };
    }

    const attachment = await this.prisma.fileAttachment.create({
      data: {
        fileId,
        entityType: dto.entityType as EntityType,
        entityId: dto.entityId,
      },
    });
    return { id: attachment.id };
  }

  /**
   * Удаление файла: сначала метаданные (каскадом вложения), затем объекты в MinIO.
   * Если MinIO недоступен, запись всё равно удаляется — «висячий» объект безвреден,
   * а ссылка из API уже не отдаётся.
   */
  async remove(id: string): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) {
      throw new NotFoundException('Файл не найден');
    }

    await this.prisma.storedFile.delete({ where: { id } });

    const bucket = file.bucket.toLowerCase() as 'photos' | 'plans' | 'avatars' | 'documents';
    try {
      await this.storage.removeObject(bucket, file.objectKey);
      if (file.thumbnailKey) {
        await this.storage.removeObject(bucket, file.thumbnailKey);
      }
    } catch {
      // намеренно не роняем запрос: метаданные уже удалены
    }
  }

  /** Список файлов с фильтрами и пагинацией. */
  async list(query: {
    skip?: number;
    take?: number;
    bucket?: Bucket;
    entityType?: EntityType;
    entityId?: string;
    uploadedById?: string;
  }): Promise<{ items: UploadedFileView[]; total: number }> {
    const where: Prisma.StoredFileWhereInput = {
      bucket: query.bucket,
      uploadedById: query.uploadedById,
      ...(query.entityType || query.entityId
        ? {
            attachments: {
              some: {
                entityType: query.entityType,
                entityId: query.entityId,
              },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.storedFile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
      }),
      this.prisma.storedFile.count({ where }),
    ]);

    return { items: items.map(toView), total };
  }

  /** Вложения сущности (используется core/tickets/chat при чтении карточек). */
  async listAttachments(entityType: EntityType, entityId: string): Promise<UploadedFileView[]> {
    const attachments = await this.prisma.fileAttachment.findMany({
      where: { entityType, entityId },
      include: { file: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return attachments.map((a) => toView(a.file));
  }

  private assertFilePresent(file: Express.Multer.File | undefined): void {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Файл не передан или пуст (поле file)');
    }
  }

  private assertMime(kind: UploadKind, mime: string): void {
    const allowed = ALLOWED_MIME[kind];
    if (!allowed.includes(mime)) {
      throw new BadRequestException(
        `Недопустимый тип файла для ${kind}: ${mime}. Разрешены: ${allowed.join(', ')}`,
      );
    }
  }

  /** Чат и документы принимают почти всё, кроме исполняемых и html/svg. */
  private assertExtensionAllowed(kind: UploadKind, originalName: string): void {
    if ((kind === 'chat' || kind === 'document') && isBlockedExtension(originalName)) {
      throw new BadRequestException(
        `Файл «${originalName}» прикрепить нельзя: исполняемые файлы, скрипты, HTML и SVG не принимаются`,
      );
    }
  }

  private assertSize(size: number): void {
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Размер файла ${(size / 1024 / 1024).toFixed(1)} МБ превышает лимит ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`,
      );
    }
  }
}

function buildObjectKey(originalName: string, kind: UploadKind): string {
  const ext = (extname(originalName) || defaultExt(kind)).toLowerCase();
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}/${randomUUID()}${ext}`;
}

function defaultExt(kind: UploadKind): string {
  if (kind === 'document') return '.bin';
  if (kind === 'plan') return '.png';
  return '.jpg';
}

function parseTakenAt(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('takenAt: ожидается дата в формате ISO 8601');
  }
  return parsed;
}

function toView(file: StoredFile): UploadedFileView {
  return {
    id: file.id,
    bucket: file.bucket,
    objectKey: file.objectKey,
    url: file.url,
    thumbnailUrl: file.thumbnailUrl,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    width: file.width,
    height: file.height,
    watermarked: file.watermarked,
    createdAt: file.createdAt,
  };
}
