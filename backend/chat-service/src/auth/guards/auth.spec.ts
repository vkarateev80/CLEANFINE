import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard, type AuthUser } from './roles.guard';
import type { Role } from '@cleaning-ops/shared/types/roles';

function contextWith(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (chat-service)', () => {
  it('пропускает публичный endpoint без токена', () => {
    const reflector = { getAllAndOverride: jest.fn(() => true) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('отдаёт проверку токена passport-стратегии для защищённого endpoint', () => {
    const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    // Проверку подписи выполняет passport (AuthGuard.parent); здесь важно, что
    // публичная ветка не сработала и guard дошёл до родительского canActivate.
    const parent = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockReturnValue(true);
    try {
      expect(guard.canActivate(contextWith())).toBe(true);
      expect(parent).toHaveBeenCalled();
    } finally {
      parent.mockRestore();
    }
  });
});

describe('RolesGuard (chat-service)', () => {
  it('пропускает endpoint без @Roles', () => {
    const reflector = { getAllAndOverride: jest.fn(() => undefined) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextWith())).toBe(true);
  });

  it('требует аутентификации при наличии @Roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['ADMIN']),
    } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(contextWith())).toThrow(ForbiddenException);
  });

  it('разрешает роль из списка и запрещает остальные', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['ADMIN', 'SUPERVISOR']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const admin: AuthUser = { id: 'u-1', email: '', role: 'ADMIN', fullName: '' };
    const operator: AuthUser = { id: 'u-2', email: '', role: 'OPERATOR', fullName: '' };

    expect(guard.canActivate(contextWith(admin))).toBe(true);
    expect(() => guard.canActivate(contextWith(operator))).toThrow(ForbiddenException);
  });

  it('сравнивает роль как строку (защита от не-строк в payload)', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['ADMIN']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const weird = { id: 'u-1', email: '', role: 42 as unknown as Role, fullName: '' };
    expect(() => guard.canActivate(contextWith(weird))).toThrow(ForbiddenException);
  });
});
