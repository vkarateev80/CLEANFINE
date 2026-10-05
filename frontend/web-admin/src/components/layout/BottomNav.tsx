import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../layouts/AdminLayout';
import { useUiStore } from '../../stores/uiStore';

export interface BottomNavProps {
  /**
   * Пункты, доступные роли (тот же `NAV` и тот же фильтр по `roles`, что у
   * сайдбара и drawer): слот рисуется только если пункт роли доступен.
   */
  items: NavItem[];
}

/**
 * Порядок слотов — из решения заказчика №3 (System Design §1, §3.4):
 * Заявки, Доска действий, Объекты, Сообщения + «Ещё». Все четыре пункта есть в `NAV`
 * каждой роли (без ограничения по `roles`), поэтому на телефоне слотов всегда
 * пять; инвариант «слот только для доступного пункта» проверяется через `items`.
 */
const SLOT_ORDER = ['/tickets', '/dashboard', '/objects', '/messages'] as const;

/**
 * Нижняя навигация телефона (<768 px). На планшете и desktop скрыта целиком
 * (`md:hidden`): там навигацию несёт сайдбар/рейка, и вторая панель только
 * съедала бы вертикаль.
 *
 * Слоты не дублируют разметку `NAV`: подписи и иконки берутся из тех же
 * элементов массива, что и в сайдбаре, — иначе меню и нижняя панель разъехались
 * бы при первой же правке списка.
 */
export function BottomNav({ items }: BottomNavProps) {
  const openDrawer = useUiStore((s) => s.openDrawer);
  const drawerOpen = useUiStore((s) => s.drawerOpen);

  // Порядок слотов задан решением заказчика, а не порядком `NAV`; пункт,
  // недоступный роли, просто выпадает из списка слотов.
  const slots = SLOT_ORDER.map((to) => items.find((item) => item.to === to)).filter(
    (item): item is NavItem => item !== undefined,
  );

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Основная навигация"
      // `pb-[env(safe-area-inset-bottom)]` — отступ под домашний индикатор iOS:
      // без него подписи слотов оказываются в системной полосе жестов.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {slots.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={item.label}
          // min-h-[44px] — тач-таргет ≥44 px по §6 System Design.
          className={({ isActive }) =>
            [
              'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] transition-colors',
              isActive ? 'text-primary-600' : 'text-neutral-500 hover:text-neutral-800',
            ].join(' ')
          }
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {item.icon}
          </span>
          <span className="max-w-full truncate">{item.label}</span>
        </NavLink>
      ))}

      {/* Пятый слот «Ещё» открывает тот же ролевой drawer, что и бургер в шапке. */}
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Ещё"
        aria-expanded={drawerOpen}
        className={[
          'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] transition-colors',
          drawerOpen ? 'text-primary-600' : 'text-neutral-500 hover:text-neutral-800',
        ].join(' ')}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋯
        </span>
        <span>Ещё</span>
      </button>
    </nav>
  );
}
