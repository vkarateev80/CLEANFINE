import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

const dbUser = {
  id: 'u1',
  email: 'admin',
  phone: null,
  passwordHash: 'hash',
  pinCode: null,
  biometricKey: null,
  fullName: 'Администратор',
  role: 'ADMIN',
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('JwtStrategy', () => {
  const prisma = { user: { findUnique: jest.fn() } };

  function buildStrategy(accessSecret: string | undefined = 'secret') {
    const config = { get: jest.fn().mockReturnValue(accessSecret) } as unknown as ConfigService;
    return new JwtStrategy(config, prisma as unknown as PrismaService);
  }

  beforeEach(() => jest.clearAllMocks());

  describe('конструктор', () => {
    it('берёт секрет из конфига', () => {
      const strategy = buildStrategy('my-secret');
      expect(strategy).toBeInstanceOf(JwtStrategy);
      // секрет применяется внутри super(...) — косвенно проверяем через отсутствие падения
    });

    it('имеет dev-фолбэк, если секрет не задан', () => {
      expect(() => buildStrategy(undefined)).not.toThrow();
    });
  });

  describe('validate', () => {
    it('возвращает безопасный AuthUser без секретных полей', async () => {
      prisma.user.findUnique.mockResolvedValue(dbUser);
      const result = await buildStrategy().validate({
        sub: 'u1',
        email: dbUser.email,
        role: 'ADMIN',
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'admin',
        role: 'ADMIN',
        fullName: 'Администратор',
      });
      expect(Object.keys(result)).not.toContain('passwordHash');
      expect(Object.keys(result)).not.toContain('pinCode');
      expect(Object.keys(result)).not.toContain('biometricKey');
    });

    it('падает, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        buildStrategy().validate({ sub: 'ghost', email: 'x@y.z', role: 'ADMIN' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('падает, если пользователь деактивирован (проверка на каждом запросе)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...dbUser, isActive: false });
      await expect(
        buildStrategy().validate({ sub: 'u1', email: dbUser.email, role: 'ADMIN' }),
      ).rejects.toThrow('Пользователь не найден или деактивирован');
    });

    it('ищет пользователя по payload.sub, а не по данным токена', async () => {
      prisma.user.findUnique.mockResolvedValue(dbUser);
      await buildStrategy().validate({ sub: 'u1', email: 'подмена@example.com', role: 'CLIENT' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
