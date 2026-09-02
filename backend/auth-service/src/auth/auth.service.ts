import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { TokenPair } from '../tokens/tokens.service';
import { TokensService } from '../tokens/tokens.service';
import { toSafeUser, type SafeUser } from '../users/user.mapper';
import type { BiometricDto } from './dto/biometric.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ChangePinDto } from './dto/change-pin.dto';
import type { LoginDto } from './dto/login.dto';
import type { PinLoginDto } from './dto/pin-login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Пользователь деактивирован');
    }
    return this.tokens.generatePair(user);
  }

  async pinLogin(dto: PinLoginDto): Promise<TokenPair> {
    if (!dto.email && !dto.phone) {
      throw new UnauthorizedException('Укажите email или телефон');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email?.toLowerCase() }, { phone: dto.phone }],
      },
    });
    if (!user?.pinCode || !(await bcrypt.compare(dto.pinCode, user.pinCode))) {
      throw new UnauthorizedException('Неверный PIN');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Пользователь деактивирован');
    }
    return this.tokens.generatePair(user);
  }

  async biometricLogin(dto: BiometricDto): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { biometricKey: dto.biometricKey },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Биометрический ключ не распознан');
    }
    return this.tokens.generatePair(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<TokenPair> {
    return this.tokens.rotate(dto.refreshToken);
  }

  async logout(userId: string, dto?: RefreshTokenDto): Promise<void> {
    if (dto?.refreshToken) {
      await this.tokens.revoke(dto.refreshToken);
    } else {
      await this.tokens.revokeAllForUser(userId);
    }
  }

  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    return toSafeUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Текущий пароль указан неверно');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
  }

  async changePin(userId: string, dto: ChangePinDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Текущий пароль указан неверно');
    }
    const pinCode = await bcrypt.hash(dto.newPin, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { pinCode } });
  }
}
