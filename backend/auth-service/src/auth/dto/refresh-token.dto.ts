import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Необязателен: `POST /api/auth/logout` без refreshToken означает «отозвать все
   * сессии пользователя» (AuthService.logout → revokeAllForUser). Пока поле было
   * обязательным, эта ветка была недостижима — ValidationPipe отвечал 400.
   * Для `POST /api/auth/refresh` токен по-прежнему обязателен (проверяется в сервисе).
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
