import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}

/** Ширина меню — `w-56` (14rem). */
const MENU_WIDTH_PX = 224;
/** Зазор между кнопкой и меню и минимальный отступ от края окна. */
const GAP_PX = 4;
const EDGE_PX = 8;

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Позиция меню в координатах окна: под кнопкой, по её правому краю; если снизу
 * не помещается, а сверху места больше, — над кнопкой. Экспорт — для теста.
 */
export function menuPosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'right'>,
  menuHeight: number,
  viewport: { width: number; height: number },
): MenuPosition {
  const spaceBelow = viewport.height - anchor.bottom - GAP_PX - EDGE_PX;
  const spaceAbove = anchor.top - GAP_PX - EDGE_PX;
  const up = menuHeight > spaceBelow && spaceAbove > spaceBelow;
  const top = up
    ? Math.max(EDGE_PX, anchor.top - GAP_PX - menuHeight)
    : anchor.bottom + GAP_PX;
  const left = Math.min(
    Math.max(EDGE_PX, anchor.right - MENU_WIDTH_PX),
    Math.max(EDGE_PX, viewport.width - MENU_WIDTH_PX - EDGE_PX),
  );
  return { top, left };
}

/**
 * Меню действий строки (⋮). Общего Dropdown в `components/ui` нет, а нативных
 * `<details>`/`<dialog>` недостаточно: меню нужно закрывать по клику вне и по Esc —
 * иначе оно перекрывает соседние строки таблицы.
 *
 * 07.11.2026: меню рисуется порталом в `<body>` с `position: fixed`. Раньше оно
 * было `absolute` внутри таблицы, а обёртка таблицы обрезает содержимое
 * (`overflow`): у таблицы этажей из одной строки пункт «Удалить» уходил под край.
 */
export function ActionMenu({
  items,
  label = 'Действия',
}: {
  items: ActionMenuItem[];
  /** Подпись для скринридера: у иконочной кнопки нет текста. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const anchor = containerRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    setPosition(
      menuPosition(anchor, menu.offsetHeight, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, []);

  // Высота меню известна только после рендера — меряем до отрисовки кадра.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onKeyDown);
    // Прокрутка страницы или таблицы и смена размера окна: меню едет за кнопкой.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              // До первого замера меню невидимо: иначе мелькнуло бы в углу окна.
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed z-50 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-left shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={[
                  'block w-full px-4 py-2 text-left text-sm hover:bg-neutral-50',
                  item.tone === 'danger' ? 'text-danger-600' : 'text-neutral-800',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
