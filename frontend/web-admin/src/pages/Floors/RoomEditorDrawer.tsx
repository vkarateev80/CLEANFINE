import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import type { RoomWithTechCard, TechCardListItem } from '../../types/core';
import { formatDateTime, type PlanSize, type Rect } from './floorPlanUtils';
import { RoomFormFields } from './RoomFormFields';
import {
  hasFormErrors,
  roomFormValues,
  validateRoomForm,
  withRect,
  type RoomFormErrors,
  type RoomFormValues,
} from './roomForm';

interface RoomEditorDrawerProps {
  room: RoomWithTechCard;
  /** Несохранённая геометрия после сдвига/растягивания на плане. */
  draftRect: Rect | null;
  planSize: PlanSize | null;
  planImageAvailable: boolean;
  planScale: number | null;
  techCards: TechCardListItem[];
  floorTypeOptions: string[];
  canEdit: boolean;
  isAdmin: boolean;
  busy: boolean;
  error: unknown;
  onSubmit: (values: RoomFormValues) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Карточка помещения (drawer справа): план остаётся видимым и доступным.
 *
 * Адаптив. На телефоне (<768 px) панель занимает всю ширину и обрезается сверху
 * и снизу: сверху — шапкой каркаса (`top-16`), снизу — фиксированной нижней
 * навигацией (4.5rem + safe-area). Без этого нижнего ограничения кнопки
 * «Сохранить»/«Отмена» уезжали бы под навигацию и были бы недоступны.
 * На планшете и desktop вид прежний: `sm:w-96` боковая панель поверх плана.
 */
export function RoomEditorDrawer({
  room,
  draftRect,
  planSize,
  planImageAvailable,
  planScale,
  techCards,
  floorTypeOptions,
  canEdit,
  isAdmin,
  busy,
  error,
  onSubmit,
  onDelete,
  onClose,
}: RoomEditorDrawerProps) {
  const [values, setValues] = useState<RoomFormValues>(() => roomFormValues(room));
  const [errors, setErrors] = useState<RoomFormErrors>({});

  // Сдвиг помещения на плане меняет координаты прямо в открытой карточке.
  useEffect(() => {
    if (!draftRect) return;
    setValues((current) => withRect(current, draftRect));
  }, [draftRect]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  function patch(next: Partial<RoomFormValues>) {
    setValues((current) => ({ ...current, ...next }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateRoomForm(values, planSize);
    setErrors(nextErrors);
    if (hasFormErrors(nextErrors)) return;
    onSubmit(values);
  }

  // На телефоне панель тянется от шапки каркаса до нижней навигации:
  // `h-auto` + `bottom` вместо `h-[calc(100vh-4rem)]`, иначе футер с
  // «Сохранить» уходил бы под фиксированную навигацию. `max-md:` — вид
  // планшета и desktop не меняется.
  return (
    <aside
      role="dialog"
      aria-label={`Помещение ${room.name}`}
      className="fixed right-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-full flex-col border-l border-neutral-200 bg-white shadow-lg sm:w-96 max-md:bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] max-md:h-auto"
    >
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-4">
        <div>
          <div className="text-lg font-medium text-neutral-900">{room.name}</div>
          <div className="text-xs text-neutral-400">
            {canEdit ? 'Правка помещения' : 'Просмотр помещения'}
          </div>
        </div>
        <Button variant="ghost" size="sm" aria-label="Закрыть карточку помещения" onClick={onClose}>
          ✕
        </Button>
      </div>

      <form
        data-testid="room-edit-form"
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4">
          <RoomFormFields
            idPrefix="room-edit"
            values={values}
            errors={errors}
            onChange={patch}
            techCards={techCards}
            planSize={planSize}
            planScale={planScale}
            coordsDisabled={!planImageAvailable}
            disabled={!canEdit}
            serverError={error}
            floorTypeOptions={floorTypeOptions}
          />

          <div className="mt-4 flex flex-col gap-1 text-xs text-neutral-400">
            <span className="font-mono">id: {room.id}</span>
            <span className="font-mono">создано: {formatDateTime(room.createdAt)}</span>
            <span className="font-mono">изменено: {formatDateTime(room.updatedAt)}</span>
          </div>
        </div>

        {/* На телефоне кнопки футера — столбиком во всю ширину: «Удалить
            помещение» + «Отмена» + «Сохранить» в строку на 360 px не помещаются
            и выдавили бы панель по горизонтали. */}
        <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
          {isAdmin ? (
            <Button
              variant="danger"
              size="sm"
              type="button"
              data-testid="room-delete"
              disabled={busy}
              onClick={onDelete}
            >
              Удалить помещение
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 max-md:flex-col max-md:gap-3">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button
              size="sm"
              type="submit"
              data-testid="room-edit-submit"
              loading={busy}
              disabled={!canEdit}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
}
