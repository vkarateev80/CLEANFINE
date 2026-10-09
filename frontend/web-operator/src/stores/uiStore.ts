import { create } from 'zustand';

interface UiState {
  /** Заголовок шапки shell-экранов («Сегодня · БЦ «Север»»). */
  title: string;
  setTitle: (title: string) => void;
  /** Короткое сообщение внизу экрана (аналог snackbar). */
  toast: { id: number; text: string; tone: 'info' | 'success' | 'error' } | null;
  showToast: (text: string, tone?: 'info' | 'success' | 'error') => void;
  hideToast: () => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
  title: 'Сегодня',
  setTitle: (title) => set({ title }),
  toast: null,
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastSeq, text, tone } }),
  hideToast: () => set({ toast: null }),
}));

export function showToast(text: string, tone: 'info' | 'success' | 'error' = 'info'): void {
  useUiStore.getState().showToast(text, tone);
}
