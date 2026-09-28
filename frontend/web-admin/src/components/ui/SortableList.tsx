import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Список с переупорядочиванием. Требование DS-003 («drag-and-drop интерфейсы»)
 * закрыто `@dnd-kit`: он даёт доступность из коробки — `KeyboardSensor` +
 * `sortableKeyboardCoordinates` позволяют переставлять строки с клавиатуры
 * (Space/Enter — взять, стрелки — двигать, Space — отпустить), что для
 * внутренней админки важнее «красоты» перетаскивания.
 *
 * Альтернативу — нативный HTML5 drag-and-drop — отвергли: он не даёт
 * клавиатурной альтернативы и плохо переносится на touch-устройства (планшеты
 * заявлены в DS-003 как целевые).
 *
 * Ручка (⠿) вынесена отдельной кнопкой: перетаскивание «за всю строку» ломает
 * клики по вложенным полям (input времени, кнопка удаления).
 */

export interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Вызывается с ПОЛНЫМ новым порядком id — ровно то, что ждёт `PATCH .../reorder`. */
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  disabled?: boolean;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled,
}: SortableListProps<T>) {
  const sensors = useSensors(
    // Смещение 6 px: без него обычный клик по ручке считался бы началом drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  /** Перестановка кнопками — тот же путь, что и drag, поэтому логика одна. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    onReorder(arrayMove(ids, index, target));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col">
          {items.map((item, index) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
              index={index}
              total={items.length}
              disabled={disabled}
              onMove={move}
            >
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  id: string;
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (index: number, delta: number) => void;
  children: ReactNode;
}

function SortableRow({ id, index, total, disabled, onMove, children }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center gap-3 border-b border-neutral-200 px-4 py-2 last:border-b-0',
        isDragging ? 'bg-neutral-50 opacity-50' : 'bg-white',
      ].join(' ')}
      data-testid={`sortable-row-${id}`}
    >
      {/* Ручка: тач-таргет ≥44 px на телефоне и планшете. Зона нажатия расширена
          псевдоэлементом `after`, а не padding/размером: padding сдвинул бы номер
          строки и содержимое, а плотность строки на планшете важна. Сам глиф — 20×24,
          поэтому `-inset-2` (≈36×40) порога не давал: замером подобрано `-inset-3`
          — 44×48 px, то есть ≥44 в обе стороны. На desktop (`lg:`) правил нет. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label="Переместить"
        title="Перетащите или используйте Space и стрелки"
        className="relative cursor-grab rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed max-lg:after:absolute max-lg:after:-inset-3 max-lg:after:content-['']"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <span className="w-6 shrink-0 text-right font-mono text-xs text-neutral-500">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">{children}</div>

      {/* Кнопки-дубли: drag недоступен с клавиатуры в некоторых скринридерах,
          а на tablet-ширине ручка попадает под палец хуже, чем кнопка. */}
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Выше"
          disabled={disabled || index === 0}
          onClick={() => onMove(index, -1)}
        >
          ↑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Ниже"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index, 1)}
        >
          ↓
        </Button>
      </div>
    </li>
  );
}
