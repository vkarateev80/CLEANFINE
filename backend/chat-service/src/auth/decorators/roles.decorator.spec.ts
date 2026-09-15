import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles (chat-service)', () => {
  it('ключ метаданных совпадает с ключом в RolesGuard', () => {
    expect(ROLES_KEY).toBe('roles');
  });

  it('создаёт декоратор для переданных ролей', () => {
    expect(typeof Roles('ADMIN', 'SUPERVISOR')).toBe('function');
  });
});
