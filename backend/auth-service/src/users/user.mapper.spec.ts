import type { User } from '@prisma/client';
import { toSafeUser } from './user.mapper';

const dbUser = {
  id: 'u1',
  email: 'admin@cleaning-ops.com',
  phone: '+79990000000',
  passwordHash: 'secret-hash',
  pinCode: 'secret-pin',
  biometricKey: 'secret-biometric',
  fullName: 'Администратор',
  role: 'ADMIN',
  avatarUrl: 'https://cdn/avatar.png',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
} as unknown as User;

describe('toSafeUser', () => {
  it('возвращает только публичные поля', () => {
    expect(toSafeUser(dbUser)).toEqual({
      id: 'u1',
      email: 'admin@cleaning-ops.com',
      phone: '+79990000000',
      fullName: 'Администратор',
      role: 'ADMIN',
      avatarUrl: 'https://cdn/avatar.png',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
  });

  it.each(['passwordHash', 'pinCode', 'biometricKey'])('не пропускает %s', (field) => {
    expect(Object.keys(toSafeUser(dbUser))).not.toContain(field);
  });

  it('не мутирует исходный объект', () => {
    const snapshot = { ...dbUser };
    toSafeUser(dbUser);
    expect(dbUser).toEqual(snapshot);
  });
});
