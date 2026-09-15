import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { ALL_BUCKETS, BUCKETS, type BucketName } from '../config/configuration';

/** Клиент MinIO + гарантия существования бакетов и публичного чтения. */
@Injectable()
export class StorageService {
  private readonly client: Client;
  private readonly publicUrl: string;
  private ready?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    this.client = new Client({
      endPoint: this.config.get<string>('minio.endPoint') ?? 'localhost',
      port: this.config.get<number>('minio.port') ?? 9000,
      useSSL: this.config.get<boolean>('minio.useSSL') ?? false,
      accessKey: this.config.get<string>('minio.accessKey') ?? 'minioadmin',
      secretKey: this.config.get<string>('minio.secretKey') ?? 'minioadmin',
    });
    this.publicUrl = (this.config.get<string>('minio.publicUrl') ?? '').replace(/\/+$/, '');
  }

  /** Идемпотентно создаёт бакеты и включает публичное чтение (вызывается лениво). */
  async ensureBuckets(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        for (const bucket of ALL_BUCKETS) {
          const exists = await this.client.bucketExists(bucket);
          if (!exists) {
            await this.client.makeBucket(bucket);
          }
          // Прямые URL в ответах API требуют публичного чтения объектов.
          await this.client.setBucketPolicy(bucket, publicReadPolicy(bucket));
        }
      })();
    }
    return this.ready;
  }

  async putObject(
    bucket: BucketName,
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.ensureBuckets();
    await this.client.putObject(bucket, objectKey, body, body.length, {
      'Content-Type': contentType,
    });
  }

  async removeObject(bucket: BucketName, objectKey: string): Promise<void> {
    await this.ensureBuckets();
    await this.client.removeObject(bucket, objectKey);
  }

  /** Публичный URL объекта. */
  url(bucket: BucketName, objectKey: string): string {
    return `${this.publicUrl}/${bucket}/${objectKey}`;
  }

  /** Проверка доступности MinIO — используется в /health. */
  async ping(): Promise<boolean> {
    try {
      await this.ensureBuckets();
      return true;
    } catch {
      return false;
    }
  }

  /** Доступ к низкоуровневому клиенту (нужен тестам и служебным операциям). */
  get raw(): Client {
    return this.client;
  }
}

/** Политика: чтение всем, запись — только сервису (через свои креды). */
function publicReadPolicy(bucket: BucketName): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

export { BUCKETS };
