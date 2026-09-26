import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

const ACCESS_SECRET = 'integration-access-secret';
// Секрет для e2e-стенда задаётся окружением; локальная копия не нужна.
const _REFRESH_SECRET = 'integration-refresh-secret';

interface TestUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

/**
 * Стратегия повторяет поведение боевой: подпись проверяется реальным секретом,
 * пользователь достаётся из payload. Это позволяет проверять полный HTTP-путь
 * (guard → контроллер → пайп), не поднимая БД.
 */
class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ACCESS_SECRET,
    });
  }

  validate(payload: { sub: string; email: string; role: string }): TestUser {
    return { id: payload.sub, email: payload.email, role: payload.role, fullName: 'Тест' };
  }
}

describe('AuthController (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const authService = {
    login: jest.fn(),
    pinLogin: jest.fn(),
    biometricLogin: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
    changePassword: jest.fn(),
    changePin: jest.fn(),
  };

  const tokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: ACCESS_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        TestJwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Тот же пайп, что в main.ts — регрессия «DTO через import type» ловится именно здесь.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  const bearer = (role: string) =>
    `Bearer ${jwt.sign({ sub: 'u1', email: 'u1@cleaning-ops.com', role })}`;

  describe('POST /api/auth/login', () => {
    it('тело доходит до сервиса целиком (whitelist не съедает поля)', async () => {
      authService.login.mockResolvedValue(tokenPair);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@cleaning-ops.com', password: 'admin123' })
        .expect(201);

      expect(authService.login).toHaveBeenCalledWith({
        email: 'admin@cleaning-ops.com',
        password: 'admin123',
      });
    });

    it('возвращает пару токенов', async () => {
      authService.login.mockResolvedValue(tokenPair);
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@cleaning-ops.com', password: 'admin123' })
        .expect(201);
      expect(res.body).toEqual(tokenPair);
    });

    it('отклоняет невалидный email (400) с русским сообщением', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'admin123' })
        .expect(400);
      expect(res.body.message).toContain('Некорректный email');
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('отклоняет короткий пароль (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@cleaning-ops.com', password: '123' })
        .expect(400);
    });

    it('отклоняет пустое тело (400), а не падает 500', async () => {
      await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
    });

    it('эндпоинт публичный — токен не нужен', async () => {
      authService.login.mockResolvedValue(tokenPair);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'a@b.co', password: 'admin123' })
        .expect(201);
    });
  });

  describe('POST /api/auth/pin и /biometric (публичные)', () => {
    it('PIN-логин отдаёт токены', async () => {
      authService.pinLogin.mockResolvedValue(tokenPair);
      const res = await request(app.getHttpServer())
        .post('/api/auth/pin')
        .send({ email: 'admin@cleaning-ops.com', pinCode: '1234' })
        .expect(201);
      expect(res.body).toEqual(tokenPair);
    });

    it('отклоняет PIN неверного формата', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/pin')
        .send({ email: 'admin@cleaning-ops.com', pinCode: 'abcd' })
        .expect(400);
    });

    it('биометрия отдаёт токены', async () => {
      authService.biometricLogin.mockResolvedValue(tokenPair);
      await request(app.getHttpServer())
        .post('/api/auth/biometric')
        .send({ biometricKey: 'key-1' })
        .expect(201);
      expect(authService.biometricLogin).toHaveBeenCalledWith({ biometricKey: 'key-1' });
    });
  });

  describe('POST /api/auth/refresh (публичный)', () => {
    it('делегирует ротацию', async () => {
      authService.refresh.mockResolvedValue(tokenPair);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'refresh-1' })
        .expect(201);
      expect(authService.refresh).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
    });

    it('refreshToken необязателен в DTO (нужен для logout без тела)', async () => {
      authService.refresh.mockResolvedValue(tokenPair);
      await request(app.getHttpServer()).post('/api/auth/refresh').send({}).expect(201);
      expect(authService.refresh).toHaveBeenCalledWith({});
    });
  });

  describe('защищённые эндпоинты', () => {
    it('GET /api/auth/me без токена → 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/auth/me с токеном → 200 и данные пользователя', async () => {
      authService.me.mockResolvedValue({ id: 'u1', email: 'u1@cleaning-ops.com', role: 'ADMIN' });
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', bearer('ADMIN'))
        .expect(200);
      expect(res.body.id).toBe('u1');
      expect(authService.me).toHaveBeenCalledWith('u1');
    });

    it('GET /api/auth/me с мусорным токеном → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('POST /api/auth/logout → 204 и отзыв токенов', async () => {
      authService.logout.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', bearer('ADMIN'))
        .send({ refreshToken: 'refresh-1' })
        .expect(204);
      expect(authService.logout).toHaveBeenCalledWith('u1', { refreshToken: 'refresh-1' });
    });

    it('POST /api/auth/change-password валидирует DTO', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', bearer('ADMIN'))
        .send({ currentPassword: 'old', newPassword: '123' })
        .expect(400);
    });

    it('POST /api/auth/change-password проходит с корректным телом', async () => {
      authService.changePassword.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', bearer('ADMIN'))
        .send({ currentPassword: 'old-pass', newPassword: 'new-pass-1' })
        .expect(201);
      expect(authService.changePassword).toHaveBeenCalledWith('u1', {
        currentPassword: 'old-pass',
        newPassword: 'new-pass-1',
      });
    });

    it('POST /api/auth/change-pin валидирует формат PIN', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/change-pin')
        .set('Authorization', bearer('ADMIN'))
        .send({ currentPassword: 'old-pass', newPin: '12' })
        .expect(400);
    });

    it('POST /api/auth/change-pin проходит с корректным телом', async () => {
      authService.changePin.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .post('/api/auth/change-pin')
        .set('Authorization', bearer('ADMIN'))
        .send({ currentPassword: 'old-pass', newPin: '5678' })
        .expect(201);
      expect(authService.changePin).toHaveBeenCalledWith('u1', {
        currentPassword: 'old-pass',
        newPin: '5678',
      });
    });
  });
});
