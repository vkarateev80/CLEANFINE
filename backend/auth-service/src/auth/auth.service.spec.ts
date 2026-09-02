import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';
const passwordHash = bcrypt.hashSync('secret123', 10);
const pinHash = bcrypt.hashSync('1234', 10);

const activeUser = {
  id: 'u1',
  email: 'admin@cleaning-ops.com',
  phone: null,
  passwordHash,
  pinCode: pinHash,
  biometricKey: null,
  fullName: 'Администратор',
  role: 'ADMIN',
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const tokens = {
    generatePair: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokensService, useValue: tokens },
      ],
    }).compile();
    service = module.get(AuthService);
    tokens.generatePair.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1' });
  });

  describe('login', () => {
    it('должен вернуть пару токенов при верном пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      const result = await service.login({ email: 'admin@cleaning-ops.com', password: 'secret123' });
      expect(result.accessToken).toBe('a1');
      expect(tokens.generatePair).toHaveBeenCalledWith(activeUser);
    });

    it('должен бросать UnauthorizedException при неверном пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(
        service.login({ email: 'admin@cleaning-ops.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен бросать UnauthorizedException при неверном email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@cleaning-ops.com', password: 'secret123' }),
      ).rejects.toThrow('Неверный email или пароль');
    });

    it('должен бросать UnauthorizedException для деактивированного пользователя', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });
      await expect(
        service.login({ email: 'admin@cleaning-ops.com', password: 'secret123' }),
      ).rejects.toThrow('Пользователь деактивирован');
    });
  });

  describe('pinLogin', () => {
    it('должен вернуть токены при верном PIN', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      const result = await service.pinLogin({ email: 'admin@cleaning-ops.com', pinCode: '1234' });
      expect(result.refreshToken).toBe('r1');
    });

    it('должен бросать при неверном PIN', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      await expect(service.pinLogin({ email: 'admin@cleaning-ops.com', pinCode: '9999' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('должен делегировать ротацию в TokensService', async () => {
      tokens.rotate.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
      const result = await service.refresh({ refreshToken: 'old-refresh' });
      expect(result.accessToken).toBe('a2');
      expect(tokens.rotate).toHaveBeenCalledWith('old-refresh');
    });
  });

  describe('changePassword', () => {
    it('должен менять пароль и отзывать токены при верном текущем пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      await service.changePassword('u1', { currentPassword: 'secret123', newPassword: 'new-secret-123' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ passwordHash: expect.any(String) }),
        }),
      );
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('должен бросать при неверном текущем пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'new-secret-123' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changePin', () => {
    it('должен обновлять PIN', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      await service.changePin('u1', { currentPassword: 'secret123', newPin: '5678' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pinCode: expect.any(String) }) }),
      );
    });
  });
});
