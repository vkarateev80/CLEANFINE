import { create } from 'zustand';

/**
 * Состояние навигационного каркаса (System Design §3.5).
 *
 * Вынесено в стор, а не в локальный `useState` внутри `AdminLayout`, потому что
 * телефонный drawer — отдельный компонент (`MobileDrawer`) и открывается/
 * закрывается из четырёх независимых мест: бургер в шапке, слот «Ещё» в нижней
 * навигации, затемнение/Escape внутри самого drawer и смена маршрута в каркасе.
 * С одним флагом в сторе эти места не приходится связывать пробросом пропсов.
 *
 * `persist` здесь не нужен и вреден: после перезагрузки страницы навигация
 * всегда должна начинаться с закрытого меню (в отличие от сессии в `authStore`).
 */
interface UiState {
  /** Открыт ли выезжающий drawer (только телефонный диапазон, <768 px). */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /**
   * «Закрыть всё навигационное». Отдельное имя, а не просто `closeDrawer`, —
   * чтобы эффекты каркаса (смена маршрута, переход через 768 px) не зависели от
   * того, сколько навигационных поверхностей появится позже.
   */
  closeAll: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  closeAll: () => set({ drawerOpen: false }),
}));
