import { useState, type FormEvent } from 'react';
import { Button, Modal } from '../../components/ui';
import type { TechCardListItem } from '../../types/core';
import { rectAreaHint, type PlanSize, type Rect } from './floorPlanUtils';
import { RoomFormFields } from './RoomFormFields';
import {
  emptyRoomFormValues,
  hasFormErrors,
  validateRoomForm,
  withRect,
  type RoomFormErrors,
  type RoomFormValues,
} from './roomForm';

interface RoomCreateModalProps {
  open: boolean;
  /** Рамка, нарисованная (или клик) на плане; `null` — «указать координаты вручную». */
  rect: Rect | null;
  planImageAvailable: boolean;
  planSize: PlanSize | null;
  planScale: number | null;
  techCards: TechCardListItem[];
  floorTypeOptions: string[];
  suggestedName: string;
  suggestedFloorType: string;
  busy: boolean;
  error: unknown;
  onSubmit: (values: RoomFormValues) => void;
  onClose: () => void;
}

const FORM_ID = 'room-create-form';

/** Форма нового помещения: координаты приходят из рамки, нарисованной на плане. */
export function RoomCreateModal({
  open,
  rect,
  planImageAvailable,
  planSize,
  planScale,
  techCards,
  floorTypeOptions,
  suggestedName,
  suggestedFloorType,
  busy,
  error,
  onSubmit,
  onClose,
}: RoomCreateModalProps) {
  const [values, setValues] = useState<RoomFormValues>(() => {
    const base = withRect(
      { ...emptyRoomFormValues(), name: suggestedName, floorType: suggestedFloorType },
      rect ?? { x: 0, y: 0, width: 0, height: 0 },
    );
    // Пустой рамки нет — координаты остаются незаполненными.
    if (!rect) {
      return { ...base, coordsX: '', coordsY: '', coordsWidth: '', coordsHeight: '' };
    }
    const area = rectAreaHint(rect, planScale);
    return area === null ? base : { ...base, areaM2: area.toFixed(1) };
  });
  const [errors, setErrors] = useState<RoomFormErrors>({});

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

  return (
    <Modal
      open={open}
      title="Новое помещение"
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" form={FORM_ID} data-testid="room-submit" loading={busy}>
            Создать
          </Button>
        </>
      }
    >
      <form id={FORM_ID} data-testid="room-create-form" onSubmit={handleSubmit}>
        <RoomFormFields
          idPrefix="room-create"
          values={values}
          errors={errors}
          onChange={patch}
          techCards={techCards}
          planSize={planSize}
          planScale={planScale}
          coordsDisabled={!planImageAvailable}
          disabled={busy}
          serverError={error}
          floorTypeOptions={floorTypeOptions}
        />
      </form>
    </Modal>
  );
}
