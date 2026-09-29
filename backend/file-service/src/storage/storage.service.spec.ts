import { ConfigService } from '@nestjs/config';
import { ALL_BUCKETS } from '../config/configuration';
import { StorageService } from './storage.service';

/** Мок MinIO-клиента: проверяем логику сервиса, не сеть. */
const clientMock = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  setBucketPolicy: jest.fn(),
  putObject: jest.fn(),
  removeObject: jest.fn(),
};

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => clientMock),
}));

function build(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'minio.endPoint': 'localhost',
    'minio.port': 9000,
    'minio.useSSL': false,
    'minio.accessKey': 'admin',
    'minio.secretKey': 'secret',
    'minio.publicUrl': 'http://localhost:9000/',
    ...overrides,
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  return new StorageService(config);
}

describe('StorageService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ensureBuckets', () => {
    it('создаёт отсутствующие бакеты и включает публичное чтение', async () => {
      clientMock.bucketExists.mockResolvedValue(false);
      const service = build();

      await service.ensureBuckets();

      expect(clientMock.makeBucket).toHaveBeenCalledTimes(ALL_BUCKETS.length);
      expect(clientMock.setBucketPolicy).toHaveBeenCalledTimes(ALL_BUCKETS.length);
      for (const bucket of ALL_BUCKETS) {
        expect(clientMock.makeBucket).toHaveBeenCalledWith(bucket);
      }
    });

    it('не пересоздаёт существующие бакеты', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      await build().ensureBuckets();
      expect(clientMock.makeBucket).not.toHaveBeenCalled();
      expect(clientMock.setBucketPolicy).toHaveBeenCalledTimes(ALL_BUCKETS.length);
    });

    it('политика разрешает публичное чтение объектов', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      await build().ensureBuckets();

      const [bucket, policy] = clientMock.setBucketPolicy.mock.calls[0];
      const parsed = JSON.parse(policy as string) as {
        Statement: { Action: string[]; Resource: string[] }[];
      };
      expect(bucket).toBe('photos');
      expect(parsed.Statement[0].Action).toContain('s3:GetObject');
      expect(parsed.Statement[0].Resource).toContain('arn:aws:s3:::photos/*');
    });

    it('выполняется один раз даже при параллельных вызовах', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      const service = build();

      await Promise.all([
        service.ensureBuckets(),
        service.ensureBuckets(),
        service.ensureBuckets(),
      ]);

      // 4 бакета, а не 12: результат кешируется промисом
      expect(clientMock.bucketExists).toHaveBeenCalledTimes(ALL_BUCKETS.length);
    });
  });

  describe('putObject', () => {
    it('кладёт объект с content-type и длиной', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      const body = Buffer.from('данные');

      await build().putObject('plans', '2026/09/plan.png', body, 'image/png');

      expect(clientMock.putObject).toHaveBeenCalledWith(
        'plans',
        '2026/09/plan.png',
        body,
        body.length,
        { 'Content-Type': 'image/png' },
      );
    });
  });

  describe('removeObject', () => {
    it('удаляет объект', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      await build().removeObject('photos', 'a.jpg');
      expect(clientMock.removeObject).toHaveBeenCalledWith('photos', 'a.jpg');
    });
  });

  describe('url', () => {
    it('склеивает публичный адрес без двойного слэша', () => {
      expect(build().url('photos', 'a.jpg')).toBe('http://localhost:9000/photos/a.jpg');
    });

    it('работает с CDN-адресом', () => {
      const service = build({ 'minio.publicUrl': 'https://cdn.example.com' });
      expect(service.url('plans', 'p.png')).toBe('https://cdn.example.com/plans/p.png');
    });
  });

  describe('ping', () => {
    it('возвращает true при доступном MinIO', async () => {
      clientMock.bucketExists.mockResolvedValue(true);
      await expect(build().ping()).resolves.toBe(true);
    });

    it('возвращает false, если MinIO недоступен', async () => {
      clientMock.bucketExists.mockRejectedValue(new Error('connection refused'));
      await expect(build().ping()).resolves.toBe(false);
    });
  });

  it('отдаёт низкоуровневый клиент', () => {
    expect(build().raw).toBe(clientMock);
  });
});
