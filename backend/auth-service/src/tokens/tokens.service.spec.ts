import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokensService } from './tokens.service';
import { PrismaService } from '../prisma/prisma.service';

const user = { id: 'u1', email: 'admin@cleaning-ops.com', role: 'ADMIN' };
const storedRefresh = {
  id: 'rt1',
  token: 'refresh-1',
  userId: 'u1',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  user: { ...user, isActive: true },
};

describe('TokensService', () => {
  let service: TokensService;
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const jwt = {
    signAsync: jest.fn().mockImplementation(
      async (payload: { sub: string; jti?: string }, opts: { expiresIn?: string }) =>
        `${opts.expiresIn ?? 'none'}:${payload.sub}:${payload.jti ?? 'no-jti'}`,
    ),
  };
  const config = {
    get: jest.fn((k: string): string | undefined => {
      if (k === 'jwt.accessTtl') return '15m';
      if (k === 'jwt.refreshTtl') return '30d';
      return 'secret';
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TokensService,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TokensService);
  });

  describe('generatePair', () => {
    it('должен создавать access+refresh и сохранять refresh в БД', async () => {
      const pair = await service.generatePair(user);
      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', token: pair.refreshToken }),
        }),
      );
    });

    it('refresh-токен уникален между вызовами (регрессия: 500 на повторном логине)', async () => {
      // Без jti два логина в одну секунду дают идентичный JWT → нарушение
      // unique-констрейнта refresh_tokens.token → PrismaClientKnownRequestError.
      const first = await service.generatePair(user);
      const second = await service.generatePair(user);

      expect(first.refreshToken).not.toBe(second.refreshToken);

      const refreshPayloads = jwt.signAsync.mock.calls
        .map(([payload]) => payload as { jti?: string })
        .filter((payload) => payload.jti !== undefined);

      expect(refreshPayloads.length).toBe(2);
      expect(new Set(refreshPayloads.map((p) => p.jti)).size).toBe(2);
    });

    it('expiresAt выводится из jwt.refreshTtl, а не из хардкода', async () => {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      config.get.mockImplementation((key: string) => (key === 'jwt.refreshTtl' ? '7d' : 'secret'));

      const before = Date.now();
      await service.generatePair(user);
      const after = Date.now();

      const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data as { expiresAt: Date };
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDays);
    });

    it('падает обратно на 30 дней при невалидном TTL', async () => {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      config.get.mockImplementation((key: string) => (key === 'jwt.refreshTtl' ? 'тридцать дней' : 'secret'));

      const before = Date.now();
      await service.generatePair(user);

      const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data as { expiresAt: Date };
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDays);
    });
  });

  describe('rotate', () => {
    it('должен отозвать старый и выдать новую пару', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(storedRefresh);
      const pair = await service.rotate('refresh-1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(pair.refreshToken).toBeDefined();
    });

    it('должен бросать UnauthorizedException при отсутствии токена в БД', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('unknown')).rejects.toThrow(UnauthorizedException);
    });

    it('должен бросать при отозванном/просроченном токене', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...storedRefresh, revokedAt: new Date() });
      await expect(service.rotate('refresh-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revoke', () => {
    it('должен помечать токен отозванным', async () => {
      await service.revoke('refresh-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: 'refresh-1', revokedAt: null } }),
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('должен отзывать все токены пользователя', async () => {
      await service.revokeAllForUser('u1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
    });
  });
});
