import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login, logout } from '../../api/auth';
import type { SessionUser } from '../../types';
import { LoginPage, readAutoLogin } from './LoginPage';

vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
}));
const mockLogin = vi.mocked(login);
const mockLogout = vi.mocked(logout);

const OWNER: SessionUser = {
  id: 'u-owner',
  email: 'owner@cleanfine.ru',
  phone: null,
  fullName: 'ООО «Ромашка»',
  role: 'CLIENT',
  avatarUrl: null,
  isActive: true,
};

describe('readAutoLogin (портал)', () => {
  it('читает пару email/password', () => {
    expect(readAutoLogin('?email=owner%40cleanfine.ru&password=owner123')).toEqual({
      email: 'owner@cleanfine.ru',
      password: 'owner123',
    });
  });

  it('нет параметров — null', () => {
    expect(readAutoLogin('')).toBeNull();
  });
});

describe('автоловушка портала', () => {
  beforeEach(() => {
    mockLogin.mockResolvedValue(OWNER);
    mockLogout.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/login?email=owner%40cleanfine.ru&password=owner123');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('входит под заказчиком без клавиатуры и чистит URL', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'owner@cleanfine.ru',
        password: 'owner123',
      }),
    );
    expect(window.location.search).toBe('');
    // CLIENT — разрешённая роль портала: logout не вызывается
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('обычный рендер без параметров не логинится сам', () => {
    window.history.replaceState({}, '', '/login');
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
