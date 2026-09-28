import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthUser } from './guards/roles.guard';
import { RolesGuard } from './guards/roles.guard';
// DTO импортируются как ЗНАЧЕНИЯ (не `import type`): класс должен существовать
// в рантайме, иначе Nest получает метатип Object и ValidationPipe с whitelist:true
// вырезает все поля тела — эндпоинт получает пустой DTO.
import { BiometricDto } from './dto/biometric.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterBiometricDto } from './dto/register-biometric.dto';
import { TokenPairDto } from './dto/token-pair.dto';

/** Именованный лимит входа: значения задаются в ThrottlerModule (env-настраиваемые). */
export const LOGIN_THROTTLE_NAME = 'login';

@ApiTags('auth')
@Controller('api/auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ [LOGIN_THROTTLE_NAME]: {} })
  @Post('login')
  @ApiOperation({ summary: 'Вход по email и паролю' })
  @ApiResponse({ status: 201, description: 'Пара токенов', type: TokenPairDto })
  @ApiResponse({ status: 400, description: 'Некорректное тело запроса' })
  @ApiResponse({
    status: 401,
    description: 'Неверный email или пароль / пользователь деактивирован',
  })
  @ApiResponse({ status: 429, description: 'Превышен лимит попыток входа' })
  async login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ [LOGIN_THROTTLE_NAME]: {} })
  @Post('pin')
  @ApiOperation({ summary: 'Вход по PIN (email или телефон + PIN)' })
  @ApiResponse({ status: 201, description: 'Пара токенов', type: TokenPairDto })
  @ApiResponse({ status: 401, description: 'Неверный PIN / не указан email или телефон' })
  @ApiResponse({ status: 429, description: 'Превышен лимит попыток входа' })
  async pinLogin(@Body() dto: PinLoginDto): Promise<TokenPairDto> {
    return this.auth.pinLogin(dto);
  }

  @Public()
  @Throttle({ [LOGIN_THROTTLE_NAME]: {} })
  @Post('biometric')
  @ApiOperation({ summary: 'Вход по биометрическому ключу устройства' })
  @ApiResponse({ status: 201, description: 'Пара токенов', type: TokenPairDto })
  @ApiResponse({ status: 401, description: 'Ключ не распознан / пользователь деактивирован' })
  @ApiResponse({ status: 429, description: 'Превышен лимит попыток входа' })
  async biometricLogin(@Body() dto: BiometricDto): Promise<TokenPairDto> {
    return this.auth.biometricLogin(dto);
  }

  @Post('biometric/register')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Сохранить/заменить биометрический ключ текущего пользователя (М6)',
    description: 'Вызывается после первого входа по паролю. Ключ не возвращается в /me.',
  })
  @ApiResponse({ status: 201, description: 'Профиль (без biometricKey)' })
  @ApiResponse({ status: 401, description: 'Нет access-токена' })
  async registerBiometric(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterBiometricDto,
  ): Promise<unknown> {
    return this.auth.registerBiometric(user.id, dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Обновление пары токенов (ротация refresh)' })
  @ApiResponse({ status: 201, description: 'Новая пара токенов', type: TokenPairDto })
  @ApiResponse({ status: 401, description: 'Refresh-токен невалиден, отозван или просрочен' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(dto);
  }

  @HttpCode(204)
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Выход',
    description:
      'С `refreshToken` отзывает указанную сессию; без него — все сессии пользователя (204).',
  })
  @ApiResponse({ status: 204, description: 'Сессии отозваны' })
  @ApiResponse({ status: 401, description: 'Нет access-токена' })
  async logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(user.id, dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Профиль текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Публичные поля пользователя (без хешей и PIN)' })
  @ApiResponse({ status: 401, description: 'Нет или невалидный access-токен' })
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Смена пароля (отзывает все сессии)' })
  @ApiResponse({ status: 201, description: 'Пароль изменён' })
  @ApiResponse({ status: 400, description: 'Новый пароль короче 6 символов' })
  @ApiResponse({ status: 401, description: 'Текущий пароль неверен' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto);
  }

  @Post('change-pin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Смена PIN (подтверждается текущим паролем)' })
  @ApiResponse({ status: 201, description: 'PIN изменён' })
  @ApiResponse({ status: 400, description: 'PIN не 4–6 цифр' })
  @ApiResponse({ status: 401, description: 'Текущий пароль неверен' })
  async changePin(@CurrentUser() user: AuthUser, @Body() dto: ChangePinDto): Promise<void> {
    await this.auth.changePin(user.id, dto);
  }
}
