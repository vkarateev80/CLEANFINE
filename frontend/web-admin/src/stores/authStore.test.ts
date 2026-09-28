import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionUser, TokenPair } from '../types';
import { useAuthStore } from './authStore';

const user: SessionUser = {
  id: 'u-admin-1',
  email: 'admin@cleaning-ops.com',
  phone: null,
  fullName: 'Администратор',
  role: 'ADMIN',
  avatarUrl: null,
  isActive: true,
};

const tokens: TokenPair = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
};

const STORAGE_KEY = 'cleaning-ops-auth';

describe('authStore — сессия', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
  });

  it('setTokens сохраняет пару токенов', () => {
    useAuthStore.getState().setTokens(tokens);
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-1');
    expect(state.refreshToken).toBe('refresh-1');
  });

  it('setUser сохраняет пользователя', () => {
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user?.email).toBe('admin@cleaning-ops.com');
    expect(useAuthStore.getState().user?.role).toBe('ADMIN');
  });

  it('logout очищает пользователя и оба токена', () => {
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setTokens(tokens);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
  });

  it('персистится в localStorage под ключом cleaning-ops-auth', () => {
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setTokens(tokens);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw ?? '') as {
      state: { user: SessionUser | null; accessToken: string | null };
    };
    expect(persisted.state.user?.email).toBe(user.email);
    expect(persisted.state.accessToken).toBe('access-1');
  });
});
