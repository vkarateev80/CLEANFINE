import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { CUSTOM_ROUTE_ARGS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CurrentUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

function contextWith(user?: unknown): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (gps-service)', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  beforeEach(() => jest.clearAllMocks());

  it('пропускает публичный endpoint без проверки токена', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('для защищённого endpoint делегирует passport', async () => {
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

describe('RolesGuard (gps-service)', () => {
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

  it('пропускает пустой список ролей (декоратор вызван без аргументов)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

    expect(guard.canActivate(contextWith({ role: 'OPERATOR' }))).toBe(true);
  });

  it('пропускает пользователя с нужной ролью (создание геозон — ADMIN)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN', 'SUPERVISOR', 'MANAGER']);

    expect(guard.canActivate(contextWith({ role: 'SUPERVISOR' }))).toBe(true);
  });

  it('запрещает роль вне списка', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN', 'SUPERVISOR', 'MANAGER']);

    expect(() => guard.canActivate(contextWith({ role: 'OPERATOR' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({ role: 'OPERATOR' }))).toThrow(
      'Недостаточно прав для этой операции',
    );
  });

  it('запрещает запрос без пользователя', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow('Доступ запрещён');
  });
});

describe('декораторы (gps-service)', () => {
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

  it('CurrentUser возвращает пользователя из request.user', () => {
    // createParamDecorator не выполняет фабрику сразу: Nest кладёт её в ROUTE_ARGS_METADATA
    // и вызывает при обработке запроса. Достаём фабрику так же, как это делает Nest.
    class Target {
      method(): void {
        // тело не важно: декоратор нужен только как носитель метаданных
      }
    }
    CurrentUser()(Target.prototype, 'method', 0);

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'method') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => unknown }
    >;
    const key = Object.keys(args).find((k) => k.includes(CUSTOM_ROUTE_ARGS_METADATA)) as string;
    const user = { id: 'u1', email: 'admin', role: 'ADMIN' };
    const _request = { user };

    expect(args[key].factory(undefined, contextWith(user))).toBe(user);
  });
});
