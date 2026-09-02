import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthUser } from './guards/roles.guard';
import { RolesGuard } from './guards/roles.guard';
import type { BiometricDto } from './dto/biometric.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ChangePinDto } from './dto/change-pin.dto';
import type { LoginDto } from './dto/login.dto';
import type { PinLoginDto } from './dto/pin-login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';

// 5 попыток/минуту на вход (чек-лист Auth: Rate limiting на login)
const LOGIN_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('api/auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('pin')
  async pinLogin(@Body() dto: PinLoginDto) {
    return this.auth.pinLogin(dto);
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('biometric')
  async biometricLogin(@Body() dto: BiometricDto) {
    return this.auth.biometricLogin(dto);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Body() dto?: RefreshTokenDto) {
    await this.auth.logout(user.id, dto);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto);
  }

  @Post('change-pin')
  async changePin(@CurrentUser() user: AuthUser, @Body() dto: ChangePinDto) {
    await this.auth.changePin(user.id, dto);
  }
}
