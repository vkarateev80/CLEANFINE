import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from '../decorators/access-token.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

function contextWith(user?: unknown): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (schedule-service)', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  beforeEach(() => jest.clearAllMocks());

  it('пропускает публичный эндпоинт без проверки токена', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('для защищённого эндпоинта делегирует passport', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const guard = new JwtAuthGuard(reflector);
    await expect(guard.canActivate(contextWith())).rejects.toThrow();
  });

  it('читает метаданные публичности с обработчика и класса', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const guard = new JwtAuthGuard(reflector);
    await Promise.resolve(guard.canActivate(contextWith())).catch(() => undefined);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, ['handler', 'class']);
  });
});

describe('RolesGuard (schedule-service)', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector);
  });

  it('пропускает без @Roles', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('пропускает пользователя с нужной ролью', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    expect(guard.canActivate(contextWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('пропускает, если роль входит в список разрешённых', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN', 'SUPERVISOR', 'MANAGER']);
    expect(guard.canActivate(contextWith({ role: 'SUPERVISOR' }))).toBe(true);
  });

  it('запрещает роль вне списка', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWith({ role: 'OPERATOR' }))).toThrow(ForbiddenException);
  });

  it('запрещает запрос без пользователя', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  it('пустой список ролей означает «без ограничений»', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
    expect(guard.canActivate(contextWith())).toBe(true);
  });
});

describe('JwtStrategy (schedule-service)', () => {
  function strategy() {
    const config = {
      get: jest.fn().mockReturnValue('shared-secret'),
    } as unknown as ConfigService;
    return new JwtStrategy(config);
  }

  it('превращает payload в AuthUser', () => {
    expect(strategy().validate({ sub: 'user-1', email: 'a@b.c', role: 'OPERATOR' })).toEqual({
      id: 'user-1',
      email: 'a@b.c',
      role: 'OPERATOR',
      fullName: '',
    });
  });

  it('токен без sub отклоняется', () => {
    expect(() => strategy().validate({ sub: '', email: 'a@b.c', role: 'ADMIN' })).toThrow(
      UnauthorizedException,
    );
  });

  it('использует общий секрет из конфигурации', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    expect(() => new JwtStrategy(config)).not.toThrow();
  });
});

describe('декораторы (schedule-service)', () => {
  it('Public выставляет метаданные isPublic', () => {
    class Target {}
    Public()(Target);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, Target)).toBe(true);
  });

  it('Roles сохраняет список ролей', () => {
    class Target {}
    Roles('ADMIN', 'SUPERVISOR', 'MANAGER')(Target);
    expect(Reflect.getMetadata(ROLES_KEY, Target)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER']);
  });

  it('CurrentUser объявлен как параметр-декоратор', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('CurrentUser возвращает request.user', () => {
    class Target {
      handler(_user: unknown): void {
        /* тело не важно: декоратор нужен только для метаданных */
      }
    }
    CurrentUser()(Target.prototype, 'handler', 0);
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => unknown }
    >;
    const factory = Object.values(metadata)[0].factory;

    expect(
      factory(undefined, {
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' } }) }),
      } as unknown as ExecutionContext),
    ).toEqual({ id: 'user-1' });
  });

  it('AccessToken объявлен как параметр-декоратор', () => {
    expect(typeof AccessToken).toBe('function');
  });

  it('AccessToken срезает префикс Bearer и терпит пустой заголовок', () => {
    // createParamDecorator сохраняет фабрику в метаданных параметра (ROUTE_ARGS_METADATA) —
    // извлекаем её, иначе разбор заголовка проверяется только полным e2e через Nest.
    class Target {
      handler(_token: string): void {
        /* тело не важно: декоратор нужен только для метаданных */
      }
    }
    AccessToken()(Target.prototype, 'handler', 0);
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => string }
    >;
    const factory = Object.values(metadata)[0].factory;

    const read = (request: unknown) =>
      factory(undefined, {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext);

    expect(read({ headers: { authorization: 'Bearer token-1' } })).toBe('token-1');
    expect(read({ headers: { authorization: 'token-2' } })).toBe('token-2');
    expect(read({ headers: { authorization: undefined } })).toBe('');
    expect(read({ headers: {} })).toBe('');
    expect(read({})).toBe('');
  });
});
