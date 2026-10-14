import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';

function contextWith(user?: unknown): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (ticket-service)', () => {
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
    // canActivate может вернуть boolean | Promise | Observable — приводим к промису
    await Promise.resolve(guard.canActivate(contextWith())).catch(() => undefined);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, ['handler', 'class']);
  });
});

describe('RolesGuard (ticket-service)', () => {
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

  it('запрещает роль вне списка', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWith({ role: 'OPERATOR' }))).toThrow(ForbiddenException);
  });

  it('запрещает запрос без пользователя', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});

describe('декораторы (ticket-service)', () => {
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

  it('Roles сохраняет одну роль', () => {
    class Target {}
    Roles('CLIENT')(Target);
    expect(Reflect.getMetadata(ROLES_KEY, Target)).toEqual(['CLIENT']);
  });

  it('CurrentUser объявлен как параметр-декоратор', () => {
    expect(typeof CurrentUser).toBe('function');
  });
});
