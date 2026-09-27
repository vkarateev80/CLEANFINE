import { useState, type FormEvent } from 'react';
import { Button, ErrorBanner, Field, Input, Modal } from '../../components/ui';
import type { FloorDetail, UpdateFloorPayload } from '../../types/core';

interface FloorSettingsModalProps {
  open: boolean;
  floor: FloorDetail;
  busy: boolean;
  error: unknown;
  onSubmit: (payload: UpdateFloorPayload) => void;
  onClose: () => void;
}

const FORM_ID = 'floor-edit-form';

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Параметры этажа. Пустое поле масштаба очищает `planScale`: в payload уходит
 * `null`, сервер (UpdateFloorDto) обнуляет поле; непустое должно быть числом > 0.
 */
export function FloorSettingsModal({
  open,
  floor,
  busy,
  error,
  onSubmit,
  onClose,
}: FloorSettingsModalProps) {
  const [number, setNumber] = useState(String(floor.number));
  const [name, setName] = useState(floor.name);
  const [planScale, setPlanScale] = useState(floor.planScale === null ? '' : String(floor.planScale));
  const [numberError, setNumberError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [scaleError, setScaleError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextNumber = parseNumber(number);
    const nextScale = parseNumber(planScale);
    let invalid = false;

    if (nextNumber === null || !Number.isInteger(nextNumber)) {
      setNumberError('Целое число');
      invalid = true;
    } else if (nextNumber < -5 || nextNumber > 200) {
      setNumberError('От -5 до 200');
      invalid = true;
    } else {
      setNumberError(null);
    }

    if (name.trim() === '') {
      setNameError('Укажите название этажа');
      invalid = true;
    } else {
      setNameError(null);
    }

    if (planScale.trim() !== '' && (nextScale === null || nextScale <= 0)) {
      setScaleError('Больше 0');
      invalid = true;
    } else {
      setScaleError(null);
    }

    if (invalid || nextNumber === null) return;

    const payload: UpdateFloorPayload = { number: nextNumber, name: name.trim() };
    // null при пустом поле — очистка масштаба (М2.7, дефект «нельзя очистить»).
    payload.planScale = nextScale;
    onSubmit(payload);
  }

  return (
    <Modal
      open={open}
      title="Параметры этажа"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" form={FORM_ID} data-testid="floor-edit-submit" loading={busy}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id={FORM_ID} data-testid="floor-edit-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {Boolean(error) && <ErrorBanner error={error} />}

        <Field label="Номер этажа" htmlFor="floor-number" required error={numberError}>
          <Input
            id="floor-number"
            name="number"
            type="number"
            step="1"
            className="font-mono"
            value={number}
            disabled={busy}
            invalid={Boolean(numberError)}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>

        <Field label="Название" htmlFor="floor-name" required error={nameError}>
          <Input
            id="floor-name"
            name="name"
            value={name}
            disabled={busy}
            invalid={Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Масштаб, м/пкс"
          htmlFor="floor-scale"
          error={scaleError}
          hint="Пустое поле — не менять; 1 px ≈ 0.05 м"
        >
          <Input
            id="floor-scale"
            name="planScale"
            type="number"
            step="0.001"
            min="0"
            className="font-mono"
            value={planScale}
            disabled={busy}
            invalid={Boolean(scaleError)}
            onChange={(event) => setPlanScale(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
