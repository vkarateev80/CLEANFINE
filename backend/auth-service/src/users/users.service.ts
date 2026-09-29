import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { toSafeUser, type SafeUser } from './user.mapper';

export interface ListUsersQuery {
  skip?: number;
  take?: number;
  role?: Role;
  isActive?: boolean;
  search?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async list(query: ListUsersQuery): Promise<{ items: SafeUser[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isActive: query.isActive,
      OR: query.search
        ? [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toSafeUser), total };
  }

  async getById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return toSafeUser(user);
  }

  async register(dto: RegisterDto): Promise<SafeUser> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(dto.phone ? [{ phone: dto.phone }] : [])] },
    });
    if (existing) {
      throw new ConflictException('Пользователь с таким email/телефоном уже существует');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role ?? 'OPERATOR',
      },
    });
    return toSafeUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (dto.email || dto.phone) {
      const duplicate = await this.prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
                ...(dto.phone ? [{ phone: dto.phone }] : []),
              ],
            },
          ],
        },
      });
      if (duplicate) {
        throw new ConflictException('Email/телефон уже занят другим пользователем');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
        avatarUrl: dto.avatarUrl,
      },
    });
    // Деактивация отзывает все refresh-токены
    if (dto.isActive === false) {
      await this.tokens.revokeAllForUser(id);
    }
    return toSafeUser(updated);
  }
}
