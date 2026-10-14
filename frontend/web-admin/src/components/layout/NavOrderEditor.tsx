import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SortableList } from '../ui/SortableList';
import type { NavItem } from '../../layouts/AdminLayout';

export interface NavOrderEditorProps {
  open: boolean;
  /** Пункты в текущем (личном) порядке. */
  items: NavItem[];
  isDefault: boolean;
  onReorder: (paths: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * «Порядок меню»: перетаскивание за ручку ⠿, стрелки ↑/↓ или клавиатура
 * (Space, стрелки, Space) — тот же `SortableList`, что в точках маршрута.
 * Изменения применяются сразу: сайдбар за модалкой перестраивается на глазах.
 */
export function NavOrderEditor({
  open,
  items,
  isDefault,
  onReorder,
  onReset,
  onClose,
}: NavOrderEditorProps) {
  return (
    <Modal
      open={open}
      title="Порядок меню"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={isDefault}
            data-testid="nav-order-reset"
            onClick={onReset}
          >
            По умолчанию
          </Button>
          <Button type="button" data-testid="nav-order-done" onClick={onClose}>
            Готово
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-600">
          Перетащите пункты за ручку ⠿ или переставьте стрелками. Порядок запоминается
          для вашего входа в этом браузере и действует в боковой панели и в меню на
          телефоне.
        </p>
        <div className="overflow-hidden rounded-lg border border-neutral-200" data-testid="nav-order-list">
          <SortableList
            items={items}
            getId={(item) => item.to}
            onReorder={onReorder}
            renderItem={(item) => (
              <span className="flex items-center gap-2 text-sm text-neutral-800">
                <span aria-hidden="true" className="text-base leading-none">
                  {item.icon}
                </span>
                {item.label}
              </span>
            )}
          />
        </div>
      </div>
    </Modal>
  );
}
