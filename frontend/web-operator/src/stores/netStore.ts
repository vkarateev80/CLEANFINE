import { create } from 'zustand';

interface NetState {
  online: boolean;
  /** Когда последний раз был получен успешный ответ сервера. */
  lastOnlineAt: number | null;
  setOnline: (online: boolean) => void;
}

/**
 * Связность. `navigator.onLine` врёт в обе стороны (Wi-Fi без интернета),
 * поэтому источников два: события браузера и факты HTTP — успешный ответ
 * переводит в online, сетевая ошибка axios — в offline (offline.md §5.1).
 */
export const useNetStore = create<NetState>()((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastOnlineAt: null,
  setOnline: (online) =>
    set((state) => ({
      online,
      lastOnlineAt: online ? Date.now() : state.lastOnlineAt,
    })),
}));

export function installNetworkWatch(): void {
  if (typeof window === 'undefined') return;
  const update = () => useNetStore.getState().setOnline(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

/** Сетевая ошибка axios (нет ответа вовсе) — в отличие от 4xx/5xx. */
export function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, response, message } = error as {
    code?: string;
    response?: unknown;
    message?: string;
  };
  if (response) return false;
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    /network error|timeout/i.test(message ?? '')
  );
}
