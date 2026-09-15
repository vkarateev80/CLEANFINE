import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}

/**
 * Меню действий строки (⋮). Общего Dropdown в `components/ui` нет, а нативных
 * `<details>`/`<dialog>` недостаточно: меню нужно закрывать по клику вне и по Esc —
 * иначе оно перекрывает соседние строки таблицы.
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onDocumentMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
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
        </div>
      )}
    </div>
  );
}
