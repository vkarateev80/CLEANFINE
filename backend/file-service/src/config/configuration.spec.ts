import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import configuration, { positiveInt } from './configuration';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('configuration (file-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('собирает MinIO-настройки из окружения', () => {
    process.env.MINIO_ENDPOINT = 'minio.local';
    process.env.MINIO_PORT = '9100';
    process.env.MINIO_USE_SSL = 'true';
    process.env.MINIO_ACCESS_KEY = 'key';
    process.env.MINIO_SECRET_KEY = 'secret';

    const cfg = configuration();
    expect(cfg.minio.endPoint).toBe('minio.local');
    expect(cfg.minio.port).toBe(9100);
    expect(cfg.minio.useSSL).toBe(true);
    expect(cfg.minio.accessKey).toBe('key');
    expect(cfg.minio.secretKey).toBe('secret');
    expect(cfg.minio.publicUrl).toBe('https://minio.local:9100');
  });

  it('использует dev-значения по умолчанию', () => {
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_PORT;
    delete process.env.MINIO_USE_SSL;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
    delete process.env.MINIO_PUBLIC_URL;
    delete process.env.PORT;

    const cfg = configuration();
    expect(cfg.minio.endPoint).toBe('localhost');
    expect(cfg.minio.port).toBe(9000);
    expect(cfg.minio.useSSL).toBe(false);
    expect(cfg.minio.accessKey).toBe('minioadmin');
    expect(cfg.minio.publicUrl).toBe('http://localhost:9000');
    expect(cfg.port).toBe(3002);
  });

  it('MINIO_PUBLIC_URL переопределяет публичный адрес', () => {
    process.env.MINIO_PUBLIC_URL = 'https://cdn.example.com/files';
    expect(configuration().minio.publicUrl).toBe('https://cdn.example.com/files');
  });

  it('берёт секрет JWT из окружения', () => {
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    expect(configuration().jwt.accessSecret).toBe('shared-secret');
  });
});

describe('positiveInt', () => {
  it.each([
    ['50', 5, 50],
    ['0', 5, 5],
    ['-3', 5, 5],
    ['abc', 5, 5],
    [undefined, 5, 5],
    ['', 5, 5],
  ])('значение %s с fallback %s → %s', (value, fallback, expected) => {
    expect(positiveInt(value as string | undefined, fallback)).toBe(expected);
  });
});

describe('JwtStrategy (file-service)', () => {
  const build = (secret?: string) =>
    new JwtStrategy({ get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService);

  it('преобразует payload в AuthUser', () => {
    const user = build('secret').validate({
      sub: 'u1',
      email: 'a@b.co',
      role: 'ADMIN',
    });
    expect(user).toEqual({ id: 'u1', email: 'a@b.co', role: 'ADMIN', fullName: '' });
  });

  it('не падает без секрета в конфиге (dev-фолбэк)', () => {
    expect(() => build(undefined)).not.toThrow();
  });

  it('отклоняет payload без sub', () => {
    expect(() => build('s').validate({ sub: '', email: 'a@b.co', role: 'ADMIN' })).toThrow(
      UnauthorizedException,
    );
  });
});
