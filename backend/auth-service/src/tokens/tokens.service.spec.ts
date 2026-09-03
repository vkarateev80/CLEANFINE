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
    signAsync: jest.fn().mockImplementation(async (payload, opts) => `${opts.expiresIn}:${payload.sub}`),
  };
  const config = { get: jest.fn((k: string) => (k === 'jwt.accessTtl' || k === 'jwt.refreshTtl' ? undefined : 'secret')) };

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
