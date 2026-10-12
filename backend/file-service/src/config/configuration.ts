/**
 * Конфигурация file-service. Источник: УСТАВ.md → Агент Backend Files, п.1.
 * Значения MinIO/JWT берутся из корневого .env (как в auth-service).
 */

export const DEFAULT_MINIO_PORT = 9000;
export const DEFAULT_PORT = 3002;

/** Бакеты по уставу (п.1) + сопоставление с Prisma-enum Bucket. */
export const BUCKETS = {
  photos: 'photos',
  plans: 'plans',
  avatars: 'avatars',
  documents: 'documents',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const ALL_BUCKETS: BucketName[] = Object.values(BUCKETS);

/**
 * Лимиты загрузки: фото ≥1280×720; размер — 50 МБ (12.10.2026: было 10 МБ по
 * уставу, но видео из чата с телефона в 10 МБ не умещается; nginx подов —
 * `client_max_body_size 60m`).
 */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MIN_PHOTO_WIDTH = 1280;
export const MIN_PHOTO_HEIGHT = 720;

export const DEFAULT_PHOTO_QUALITY = 85;
export const DEFAULT_THUMBNAIL_WIDTH = 400;

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = positiveInt(process.env.MINIO_PORT, DEFAULT_MINIO_PORT);
  const useSSL = process.env.MINIO_USE_SSL === 'true';

  return {
    port: positiveInt(process.env.PORT, DEFAULT_PORT),
    minio: {
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      /**
       * Базовый URL для ссылок в ответах API. В dev фронт ходит на localhost:9000,
       * в проде подставляется публичный домен/CDN через MINIO_PUBLIC_URL.
       */
      publicUrl:
        process.env.MINIO_PUBLIC_URL ?? `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    },
  };
};
