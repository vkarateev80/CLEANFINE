import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { AuthUser } from '../guards/roles.guard';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Проверка access-токена, выданного auth-service: секрет общий (JWT_ACCESS_SECRET),
 * поэтому gps-service доверяет подписи и не ходит в auth по каждому запросу.
 * Роль берётся из payload — RBAC проверяется RolesGuard.
 * id пользователя из токена используется как user_id трека (batch мобильного клиента).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'dev-access-secret',
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) {
      throw new UnauthorizedException('Некорректный токен');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role as Role,
      // Имя в токене не передаётся: клиент может прислать его в теле batch-запроса.
      fullName: '',
    };
  }
}
