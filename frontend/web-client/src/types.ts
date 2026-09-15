import type { Role } from '@cleaning-ops/shared/types/roles';

/** Пользователь в сессии (ответ /api/auth/me и /api/users). */
export interface SessionUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
