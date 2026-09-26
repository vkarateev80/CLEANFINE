import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as passportModule from 'passport';

// passport — CommonJS-модуль; при esModuleInterop его API может лежать в .default.
const passport = ((passportModule as unknown as { default?: typeof passportModule }).default ??
  passportModule) as typeof passportModule;
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const TEST_SECRET = 'test-secret';

// Passport в изолированном тесте не знает стратегию 'jwt' — регистрируем её сами,
// чтобы супер-класс AuthGuard('jwt') действительно выполнял проверку.
beforeAll(() => {
  passport.use(
    'jwt',
    new Strategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: TEST_SECRET,
      },
      (payload: unknown, done: (err: unknown, user?: unknown) => void) => done(null, payload),
    ),
  );
});

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  const contextWith = (authorization?: string): ExecutionContext =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ headers: authorization ? { authorization } : {} }),
        getResponse: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new JwtAuthGuard(reflector);
  });

  it('читает флаг публичности с обработчика и класса', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    await guard.canActivate(contextWith());
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, ['handler', 'class']);
  });

  it('пропускает публичный эндпоинт, не обращаясь к passport (синхронный true)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    // для @Public guard возвращает true синхронно, без промиса от passport
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('защищённый эндпоинт без токена → 401', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    await expect(guard.canActivate(contextWith())).rejects.toThrow(UnauthorizedException);
  });

  it('защищённый эндпоинт с невалидным токеном → 401', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    await expect(guard.canActivate(contextWith('Bearer not-a-jwt'))).rejects.toThrow(UnauthorizedException);
  });

  it('защищённый эндпоинт с валидным токеном → пропускает', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
     
    const jwt = require('jsonwebtoken') as { sign: (p: object, s: string, o?: object) => string };
    const token = jwt.sign({ sub: 'u1', role: 'ADMIN' }, TEST_SECRET, { expiresIn: '5m' });
    await expect(guard.canActivate(contextWith(`Bearer ${token}`))).resolves.toBe(true);
  });
});
