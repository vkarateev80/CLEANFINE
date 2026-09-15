import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { parseTtlToMs } from '../common/ttl';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Дефолтный срок жизни refresh-токена (30 дней), если jwt.refreshTtl не задан. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async generatePair(user: { id: string; email: string; role: string }): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
    });
    // jti обязателен: без него JWT детерминирован (sub/email/role/iat с точностью
    // до секунды), и два логина в одну секунду дают идентичный refresh-токен →
    // нарушение unique-констрейнта на refresh_tokens.token и 500 на логине.
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshTtl,
      },
    );
    // expiresAt выводим из того же TTL, что и подпись JWT, иначе срок в БД
    // расходится со сроком в токене.
    const ttlMs = parseTtlToMs(refreshTtl, REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return { accessToken, refreshToken };
  }

  async rotate(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Невалидный refresh token');
    }
    // Отзываем старый, выдаём новую пару
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.generatePair({
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
