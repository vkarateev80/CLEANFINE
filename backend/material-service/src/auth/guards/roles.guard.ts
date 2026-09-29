import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { ROLES_KEY } from '../decorators/roles.decorator';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) {
      throw new ForbiddenException('Доступ запрещён');
    }
    const allowed = requiredRoles.some((role) => String(user.role) === role);
    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав для этой операции');
    }
    return true;
  }
}
