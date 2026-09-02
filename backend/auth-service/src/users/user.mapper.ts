import type { Role } from '@cleaning-ops/shared/types/roles';
import type { User } from '@prisma/client';

/** Публичное представление пользователя (без passwordHash/pinCode/biometricKey). */
export interface SafeUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role as Role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
