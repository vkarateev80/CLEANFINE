import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../layouts/AdminLayout';
import { useUiStore } from '../../stores/uiStore';
import type { SessionUser } from '../../types';

export interface MobileDrawerProps {
  /**
   * Полный ролевой список пунктов. Приходит из `AdminLayout` — того же массива
   * `NAV` и того же фильтра по `roles`, что и сайдбар: меню остаётся одним
   * источником правды, drawer не заводит собственную копию списка.
   */
  items: NavItem[];
  /** На телефоне шапка показывает только иконки, поэтому имя и роль — здесь. */
  user: SessionUser | null;
}

/**
 * Выезжающее меню для телефона (<768 px). Единственная поверхность, дающая
 * доступ ко всем пунктам роли: на телефоне сайдбар скрыт, а нижняя навигация
 * несёт только 5 слотов.
 *
 * Затемнение, `role="presentation"`, закрытие по клику по фону и Escape — тот
 * же приём, что в `src/components/ui/Modal.tsx` (сам файл модалки не трогаем:
 * его параллельно правит другой исполнитель).
 */
export function MobileDrawer({ items, user }: MobileDrawerProps) {
  const open = useUiStore((s) => s.drawerOpen);
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const closeAll = useUiStore((s) => s.closeAll);

  // Escape — как в модалке. Подписка живёт только пока drawer открыт: иначе
  // обработчик висел бы на документе весь сеанс.
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAll();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeAll]);

  // Блокировка скролла фона: drawer перекрывает контент, и «прокрутка под ним»
  // читается как сломанный экран. Возврат в cleanup обязателен — он срабатывает
  // и при закрытии, и при размонтировании (например, если телефонную страницу
  // покинули, не закрыв меню: без этого body остался бы без скролла навсегда).
  useEffect(() => {
    if (!open) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Закрытый drawer не рендерится вовсе: иначе его ссылки попали бы в
  // accessibility-дерево и дублировали пункты сайдбара (strict-mode селекторы
  // `getByRole('link', …)` в e2e находили бы по два совпадения).
  if (!open) return null;

  return (
    <div
      data-testid="mobile-drawer"
      // `md:hidden` — страховка на случай, если drawer остался открытым при
      // переходе ≥768 px: поверх рейки он не должен показываться никогда.
      className="fixed inset-0 z-50 flex bg-neutral-900/60 md:hidden"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDrawer();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Меню навигации"
        // Тёмная тема — как у сайдбара: drawer и сайдбар это одна навигация,
        // показанная в двух диапазонах.
        className="flex h-full w-72 max-w-[85vw] flex-col bg-neutral-900 text-neutral-100 shadow-xl"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 text-lg font-semibold text-primary-300">
          <span>🧹 CLEANFINE</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Закрыть меню"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {user && (
          <div className="shrink-0 border-b border-neutral-800 px-4 pb-3">
            <div className="truncate text-sm font-medium text-neutral-100">{user.fullName}</div>
            <div className="text-xs text-neutral-400">{user.role}</div>
          </div>
        )}

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // Клик по пункту закрывает меню. Переход по маршруту дополнительно
              // закрывает drawer эффектом в каркасе — на случай перехода не по
              // клику (программный navigate, кнопка «назад»).
              onClick={closeAll}
              aria-label={item.label}
              // min-h-[44px] — тач-таргет по §6 System Design: на телефоне
              // палец, а не курсор.
              className={({ isActive }) =>
                [
                  'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-base leading-none">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
