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
  email: 'admin',
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
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
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
      const result = await service.login({
        email: 'admin',
        password: 'secret123',
      });
      expect(result.accessToken).toBe('a1');
      expect(tokens.generatePair).toHaveBeenCalledWith(activeUser);
    });

    it('должен бросать UnauthorizedException при неверном пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(service.login({ email: 'admin', password: 'wrong-password' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('должен бросать UnauthorizedException при неверном email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@cleaning-ops.com', password: 'secret123' }),
      ).rejects.toThrow('Неверный email или пароль');
    });

    it('должен бросать UnauthorizedException для деактивированного пользователя', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });
      await expect(service.login({ email: 'admin', password: 'secret123' })).rejects.toThrow(
        'Пользователь деактивирован',
      );
    });
  });

  describe('pinLogin', () => {
    it('должен вернуть токены при верном PIN', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      const result = await service.pinLogin({ email: 'admin', pinCode: '1234' });
      expect(result.refreshToken).toBe('r1');
    });

    it('должен бросать при неверном PIN', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      await expect(service.pinLogin({ email: 'admin', pinCode: '9999' })).rejects.toThrow(
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

    it('должен бросать 401 без refreshToken, а не падать в Prisma', async () => {
      await expect(service.refresh({})).rejects.toThrow(UnauthorizedException);
      expect(tokens.rotate).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('должен менять пароль и отзывать токены при верном текущем пароле', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      await service.changePassword('u1', {
        currentPassword: 'secret123',
        newPassword: 'new-secret-123',
      });
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

    it('должен бросать при неверном текущем пароле и не менять PIN', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(
        service.changePin('u1', { currentPassword: 'wrong', newPin: '5678' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('должен бросать, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changePin('ghost', { currentPassword: 'x', newPin: '5678' }),
      ).rejects.toThrow('Текущий пароль указан неверно');
    });
  });

  describe('pinLogin — валидация входа', () => {
    it('должен бросать, если не указаны ни email, ни телефон', async () => {
      await expect(service.pinLogin({ pinCode: '1234' })).rejects.toThrow(
        'Укажите email или телефон',
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('должен искать по телефону, если email не передан', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      await service.pinLogin({ phone: '+79990000000', pinCode: '1234' });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ email: undefined }, { phone: '+79990000000' }] },
      });
    });

    it('должен нормализовать email (lowercase)', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      await service.pinLogin({ email: 'ADMIN@Cleaning-Ops.COM', pinCode: '1234' });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ email: 'admin@cleaning-ops.com' }, { phone: undefined }] },
      });
    });

    it('должен бросать для деактивированного пользователя', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, isActive: false });
      await expect(service.pinLogin({ email: activeUser.email, pinCode: '1234' })).rejects.toThrow(
        'Пользователь деактивирован',
      );
    });

    it('должен бросать, если пользователь без PIN (не 500)', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, pinCode: null });
      await expect(service.pinLogin({ email: activeUser.email, pinCode: '1234' })).rejects.toThrow(
        'Неверный PIN',
      );
    });

    it('должен бросать, если пользователь не найден', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.pinLogin({ email: 'nobody@x.y', pinCode: '1234' })).rejects.toThrow(
        'Неверный PIN',
      );
    });
  });

  describe('biometricLogin', () => {
    it('должен возвращать токены при известном ключе', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, biometricKey: 'key-1' });
      const result = await service.biometricLogin({ biometricKey: 'key-1' });
      expect(result.accessToken).toBe('a1');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { biometricKey: 'key-1' } });
    });

    it('должен бросать для неизвестного ключа', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.biometricLogin({ biometricKey: 'unknown' })).rejects.toThrow(
        'Биометрический ключ не распознан',
      );
    });

    it('должен бросать для деактивированного пользователя', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        biometricKey: 'key-1',
        isActive: false,
      });
      await expect(service.biometricLogin({ biometricKey: 'key-1' })).rejects.toThrow(
        'Биометрический ключ не распознан',
      );
    });
  });

  describe('logout', () => {
    it('должен отзывать конкретный refresh-токен, если он передан', async () => {
      await service.logout('u1', { refreshToken: 'r1' });
      expect(tokens.revoke).toHaveBeenCalledWith('r1');
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('должен отзывать все токены пользователя, если refresh не передан', async () => {
      await service.logout('u1');
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(tokens.revoke).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('должен возвращать безопасное представление пользователя', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      const result = await service.me('u1');
      expect(result.email).toBe(activeUser.email);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('pinCode');
    });

    it('должен бросать, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me('ghost')).rejects.toThrow('Пользователь не найден');
    });
  });

  describe('login — нормализация и неактивные пользователи', () => {
    it('должен нормализовать email перед поиском', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await service.login({ email: '  ADMIN@Cleaning-Ops.COM  ', password: 'secret123' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@cleaning-ops.com' },
      });
    });

    it('не должен выдавать токены деактивированному пользователю', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });
      await expect(
        service.login({ email: activeUser.email, password: 'secret123' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokens.generatePair).not.toHaveBeenCalled();
    });
  });
});
