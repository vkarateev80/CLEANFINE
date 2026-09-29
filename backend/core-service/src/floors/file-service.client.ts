import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** План, как его вернул file-service. */
export interface UploadedPlan {
  id: string;
  url: string;
  originalName: string;
  /** Размеры изображения в пикселях (ширина/высота из file-service). */
  width: number | null;
  height: number | null;
}

/**
 * Клиент file-service по HTTP.
 * Core не ходит в MinIO напрямую: файлы знает только file-service (границы сервисов).
 */
@Injectable()
export class FileServiceClient {
  private readonly logger = new Logger(FileServiceClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('fileService.baseUrl') ?? 'http://localhost:3002').replace(
      /\/+$/,
      '',
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>('fileService.timeoutMs') ?? 15_000;
  }

  /**
   * Загружает план этажа в file-service.
   * `token` — access-токен вызывающего пользователя: file-service проверяет его сам,
   * поэтому core не создаёт сервисных учёток (решение: сквозной проброс токена).
   */
  async uploadPlan(
    file: Express.Multer.File,
    token: string,
    metadata: { floorId: string; planScale?: number },
  ): Promise<UploadedPlan> {
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer);
    form.append('file', new Blob([bytes], { type: file.mimetype }), file.originalname);
    form.append('kind', 'plan');
    form.append('userName', `План этажа ${metadata.floorId}`);

    const response = await fetch(`${this.baseUrl}/api/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : `file-service вернул ${response.status}`;
      this.logger.warn(`Загрузка плана не удалась: ${message}`);
      throw new PlanUploadError(message, response.status);
    }

    const url = payload.url;
    if (typeof url !== 'string' || !url) {
      throw new PlanUploadError('file-service не вернул url файла', 502);
    }

    // Привязываем файл к этажу (кросс-сервисная привязка по UUID).
    const fileId = payload.id;
    if (typeof fileId === 'string') {
      await this.attach(fileId, metadata.floorId, token);
    }

    return {
      id: typeof fileId === 'string' ? fileId : '',
      url,
      originalName:
        typeof payload.originalName === 'string' ? payload.originalName : file.originalname,
      width: typeof payload.width === 'number' ? payload.width : null,
      height: typeof payload.height === 'number' ? payload.height : null,
    };
  }

  /** Привязка файла к сущности FLOOR_PLAN. Ошибка привязки не отменяет загрузку. */
  private async attach(fileId: string, floorId: string, token: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/files/${fileId}/attach`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entityType: 'FLOOR_PLAN', entityId: floorId }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(
          `Не удалось привязать файл ${fileId} к этажу ${floorId}: ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Привязка файла не удалась: ${(error as Error).message}`);
    }
  }
}

/** Ошибка загрузки плана: несёт статус для корректного ответа API. */
export class PlanUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlanUploadError';
  }
}
