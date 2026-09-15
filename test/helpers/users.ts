import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');

export interface FixtureUser {
  email: string;
  phone?: string;
  password: string;
  pinCode?: string;
  biometricKey?: string;
  fullName: string;
  role: 'OPERATOR' | 'SUPERVISOR' | 'ADMIN' | 'CLIENT';
  isActive: boolean;
  note?: string;
}

/** Креды берутся из test/fixtures/users.json — единый источник для seed и e2e. */
export function loadUsers(): FixtureUser[] {
  return JSON.parse(readFileSync(join(fixturesDir, 'users.json'), 'utf8')) as FixtureUser[];
}

export function userByRole(role: FixtureUser['role']): FixtureUser {
  const user = loadUsers().find((u) => u.role === role && u.isActive);
  if (!user) {
    throw new Error(`В test/fixtures/users.json нет активного пользователя с ролью ${role}`);
  }
  return user;
}
