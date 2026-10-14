import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from './roles.guard';
import { RolesGuard } from './roles.guard';

function contextWith(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  function requiredRoles(roles?: string[]) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(roles);
  }

  it('пропускает, если @Roles не задан', () => {
    requiredRoles(undefined);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('пропускает, если список ролей пуст', () => {
    requiredRoles([]);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('читает метаданные и с обработчика, и с класса', () => {
    requiredRoles(['ADMIN']);
    guard.canActivate(contextWith({ id: 'u1', email: 'a@b.c', role: 'ADMIN', fullName: 'A' }));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, ['handler', 'class']);
  });

  it('пропускает пользователя с разрешённой ролью', () => {
    requiredRoles(['ADMIN', 'SUPERVISOR', 'MANAGER']);
    const user: AuthUser = { id: 'u1', email: 'a@b.c', role: 'SUPERVISOR', fullName: 'A' };
    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('бросает Forbidden, если роли не совпали', () => {
    requiredRoles(['ADMIN']);
    const user: AuthUser = { id: 'u1', email: 'a@b.c', role: 'OPERATOR', fullName: 'A' };
    expect(() => guard.canActivate(contextWith(user))).toThrow(ForbiddenException);
  });

  it('бросает Forbidden, если пользователя в запросе нет', () => {
    requiredRoles(['ADMIN']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  it('не роняет сравнение при чужом типе роли', () => {
    requiredRoles(['ADMIN']);
    const user = { id: 'u1', email: 'a@b.c', role: 42, fullName: 'A' } as unknown as AuthUser;
    expect(() => guard.canActivate(contextWith(user))).toThrow(ForbiddenException);
  });
});
