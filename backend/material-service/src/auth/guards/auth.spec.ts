import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser, RolesGuard } from './roles.guard';

function createReflector(values: { roles?: string[]; isPublic?: boolean }): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => (key === 'roles' ? values.roles : values.isPublic)),
  } as unknown as Reflector;
}

function createContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const admin: AuthUser = {
  id: 'u-1',
  email: 'admin',
  role: 'ADMIN',
  fullName: 'Админ',
};

describe('RolesGuard (RBAC)', () => {
  it('пропускает запрос, если роли не требуются', () => {
    const guard = new RolesGuard(createReflector({}));
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('пропускает разрешённую роль и отклоняет остальные (403)', () => {
    const guard = new RolesGuard(createReflector({ roles: ['ADMIN', 'SUPERVISOR'] }));
    expect(guard.canActivate(createContext(admin))).toBe(true);

    const operatorGuard = new RolesGuard(createReflector({ roles: ['ADMIN', 'SUPERVISOR'] }));
    expect(() => operatorGuard.canActivate(createContext({ ...admin, role: 'OPERATOR' }))).toThrow(
      ForbiddenException,
    );
  });

  it('отклоняет запрос без аутентифицированного пользователя', () => {
    const guard = new RolesGuard(createReflector({ roles: ['ADMIN'] }));
    expect(() => guard.canActivate(createContext())).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  it('публичные endpoint-ы пропускаются без проверки токена', () => {
    const guard = new JwtAuthGuard(createReflector({ isPublic: true }));
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('защищённый endpoint уходит в passport-стратегию', () => {
    const guard = new JwtAuthGuard(createReflector({}));
    const superActivate = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockReturnValue(true);

    expect(guard.canActivate(createContext(admin))).toBe(true);
    expect(superActivate).toHaveBeenCalled();
    superActivate.mockRestore();
  });
});
