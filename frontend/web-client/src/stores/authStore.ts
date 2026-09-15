import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionUser, TokenPair } from '../types';

interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (tokens: TokenPair) => void;
  setUser: (user: SessionUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setTokens: (tokens) =>
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'cleaning-ops-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
