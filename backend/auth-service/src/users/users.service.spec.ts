import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';

const userRecord = {
  id: 'u1',
  email: 'operator@cleaning-ops.com',
  phone: null,
  passwordHash: bcrypt.hashSync('oper123', 10),
  pinCode: null,
  biometricKey: null,
  fullName: 'Оператор',
  role: 'OPERATOR',
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const tokens = { revokeAllForUser: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokensService, useValue: tokens },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('register', () => {
    it('должен создавать пользователя с ролью по умолчанию OPERATOR', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...userRecord,
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        role: data.role,
      }));
      const result = await service.register({
        email: 'new@cleaning-ops.com',
        password: 'password1',
        fullName: 'Новый сотрудник',
      });
      expect(result.role).toBe('OPERATOR');
      expect(result.email).toBe('new@cleaning-ops.com');
      const createdData = prisma.user.create.mock.calls[0][0].data as { passwordHash: string };
      expect(await bcrypt.compare('password1', createdData.passwordHash)).toBe(true);
    });

    it('должен бросать ConflictException при дубликате email', async () => {
      prisma.user.findFirst.mockResolvedValue(userRecord);
      await expect(
        service.register({ email: 'operator@cleaning-ops.com', password: 'password1', fullName: 'Дубль' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getById', () => {
    it('должен возвращать безопасного пользователя без хэша пароля', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      const result = await service.getById('u1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.id).toBe('u1');
    });

    it('должен бросать NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('деактивация отзывает refresh-токены', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ ...userRecord, isActive: false });
      await service.update('u1', { isActive: false });
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('должен бросать ConflictException при занятом email другим пользователем', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
      await expect(service.update('u1', { email: 'taken@example.com' })).rejects.toThrow(ConflictException);
    });

    it('должен бросать NotFoundException, если пользователя нет', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { fullName: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('проверяет уникальность и по email, и по телефону одновременно', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ ...userRecord, phone: '+79990000009' });

      await service.update('u1', { email: 'NEW@Cleaning-Ops.COM', phone: '+79990000009' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: { not: 'u1' } },
            { OR: [{ email: 'new@cleaning-ops.com' }, { phone: '+79990000009' }] },
          ],
        },
      });
    });

    it('нормализует email при обновлении', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue(userRecord);

      await service.update('u1', { email: 'UPPER@Example.COM' });

      const { data } = prisma.user.update.mock.calls[0][0] as { data: { email: string } };
      expect(data.email).toBe('upper@example.com');
    });

    it('не проверяет дубликаты, если email и телефон не меняются', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.update.mockResolvedValue(userRecord);

      await service.update('u1', { fullName: 'Новое Имя' });

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('не отзывает токены при обычном обновлении', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord);
      prisma.user.update.mockResolvedValue(userRecord);

      await service.update('u1', { fullName: 'Новое Имя' });

      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('list — фильтры', () => {
    it('должен возвращать items и total', async () => {
      prisma.$transaction.mockResolvedValue([[userRecord], 1]);
      const result = await service.list({});
      expect(result.total).toBe(1);
      expect(result.items[0].fullName).toBe('Оператор');
    });

    it('пробрасывает пагинацию и фильтры в Prisma', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({ skip: 10, take: 5, role: 'ADMIN', isActive: true, search: 'иван' });

      const where = prisma.user.findMany.mock.calls[0][0] as {
        where: { role?: string; isActive?: boolean; OR?: unknown[] };
        skip: number;
        take: number;
      };
      expect(where.skip).toBe(10);
      expect(where.take).toBe(5);
      expect(where.where.role).toBe('ADMIN');
      expect(where.where.isActive).toBe(true);
      expect(where.where.OR).toHaveLength(3);
    });

    it('ограничивает take значением 100', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({ take: 5000 });
      const args = prisma.user.findMany.mock.calls[0][0] as { take: number };
      expect(args.take).toBe(100);
    });

    it('без поиска не добавляет OR-условие', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.list({});
      const args = prisma.user.findMany.mock.calls[0][0] as { where: { OR?: unknown } };
      expect(args.where.OR).toBeUndefined();
    });
  });
});
