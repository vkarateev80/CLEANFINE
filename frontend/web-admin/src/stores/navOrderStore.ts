import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Личный порядок пунктов меню, по пользователю (ключ — id из `SessionUser`):
 * на одном компьютере могут входить разные сотрудники, и порядок админа не
 * должен достаться бригадиру. Хранится в localStorage этого браузера.
 */
interface NavOrderState {
  orders: Record<string, string[]>;
  setOrder: (userId: string, paths: string[]) => void;
  resetOrder: (userId: string) => void;
}

export const useNavOrderStore = create<NavOrderState>()(
  persist(
    (set) => ({
      orders: {},
      setOrder: (userId, paths) =>
        set((state) => ({ orders: { ...state.orders, [userId]: paths } })),
      resetOrder: (userId) =>
        set((state) => {
          const next = { ...state.orders };
          delete next[userId];
          return { orders: next };
        }),
    }),
    { name: 'cleanfine-admin-nav-order' },
  ),
);
