import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from '../../api/auth';
import type { SessionUser } from '../../types';
import { LoginPage, readAutoLogin } from './LoginPage';

vi.mock('../../api/auth', () => ({ login: vi.fn() }));
const mockLogin = vi.mocked(login);

const ADMIN: SessionUser = {
  id: 'u-admin',
  email: 'admin',
  phone: null,
  fullName: 'Администратор',
  role: 'ADMIN',
  avatarUrl: null,
  isActive: true,
};

describe('readAutoLogin', () => {
  it('читает пару email/password из query', () => {
    expect(readAutoLogin('?email=a%40b.ru&password=secret')).toEqual({
      email: 'a@b.ru',
      password: 'secret',
    });
  });

  it('без полного набора параметров — null', () => {
    expect(readAutoLogin('')).toBeNull();
    expect(readAutoLogin('?email=a%40b.ru')).toBeNull();
    expect(readAutoLogin('?password=x')).toBeNull();
  });
});

describe('автоловушка лончера', () => {
  beforeEach(() => {
    mockLogin.mockResolvedValue(ADMIN);
    window.history.replaceState({}, '', '/login?email=admin&password=admin123');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('входит без клавиатуры и очищает пароль из URL', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'admin',
        password: 'admin123',
      }),
    );
    // URL очищен сразу после подстановки — пароль не остаётся в адресной строке
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('обычный рендер без параметров не логинится сам', () => {
    window.history.replaceState({}, '', '/login');
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(mockLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });
});
