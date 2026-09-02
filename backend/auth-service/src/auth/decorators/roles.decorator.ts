import { SetMetadata } from '@nestjs/common';
import type { Role } from '@cleaning-ops/shared/types/roles';

export const ROLES_KEY = 'roles';

/** Ограничивает доступ ролями (RBAC). Пример: @Roles(Role.ADMIN) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
