import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorBanner, Field, Input } from '../../components/ui';
import type { CreateFloorPayload, FloorEntity } from '../../types/core';
import { apiMessages, defaultFloorName, parseOptionalNumber } from './utils';

export interface FloorFormValues {
  number: string;
  name: string;
  planScale: string;
}

export type FloorFormErrors = Partial<Record<keyof FloorFormValues, string>>;

function toFormValues(floor?: FloorEntity): FloorFormValues {
  if (!floor) return { number: '', name: '', planScale: '' };
  return {
    number: String(floor.number),
    name: floor.name,
    planScale: floor.planScale === null ? '' : String(floor.planScale),
  };
}

export function validateFloor(values: FloorFormValues): FloorFormErrors {
  const errors: FloorFormErrors = {};

  const number = parseOptionalNumber(values.number);
  if (number === undefined || Number.isNaN(number)) errors.number = 'Укажите номер этажа';
  else if (!Number.isInteger(number)) errors.number = 'Номер этажа — целое число';
  else if (number < 1) errors.number = 'Номер этажа — не меньше 1';

  const name = values.name.trim();
  if (name.length < 1 || name.length > 60) errors.name = 'Название — от 1 до 60 символов';

  if (values.planScale.trim() !== '') {
    const scale = parseOptionalNumber(values.planScale);
    if (scale === undefined || Number.isNaN(scale)) errors.planScale = 'Масштаб — число';
    else if (scale <= 0) errors.planScale = 'Масштаб должен быть больше 0';
  }

  return errors;
}

/** Сообщение 409 называет номер: подсветка поля экономит один шаг пользователю. */
function serverNumberError(error: unknown): string | null {
  for (const message of apiMessages(error)) {
    if (message.toLowerCase().includes('номер')) return message;
  }
  return null;
}

export interface FloorFormProps {
  floor?: FloorEntity;
  /** Номера уже существующих этажей — клиентская проверка уникальности до 409. */
  existingNumbers: number[];
  saving: boolean;
  error: unknown;
  onSubmit: (payload: CreateFloorPayload) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function FloorForm({
  floor,
  existingNumbers,
  saving,
  error,
  onSubmit,
  onCancel,
  onDirtyChange,
}: FloorFormProps) {
  const [initial] = useState<FloorFormValues>(() => toFormValues(floor));
  const [values, setValues] = useState<FloorFormValues>(initial);
  const [errors, setErrors] = useState<FloorFormErrors>({});
  /** Пока пользователь не тронул название, оно следует за номером («{number} этаж»). */
  const [nameTouched, setNameTouched] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function update<K extends keyof FloorFormValues>(key: K, value: FloorFormValues[K]) {
    if (key === 'name') setNameTouched(true);
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateNumber(value: string) {
    const parsed = parseOptionalNumber(value);
    const next = { ...values, number: value };
    if (!nameTouched && parsed !== undefined && Number.isInteger(parsed) && parsed >= 1) {
      next.name = defaultFloorName(parsed);
    }
    setValues(next);
    setErrors((current) => ({ ...current, number: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateFloor(values);
    const number = parseOptionalNumber(values.number);
    if (
      number !== undefined &&
      Number.isInteger(number) &&
      existingNumbers.includes(number) &&
      (!floor || floor.number !== number)
    ) {
      validation.number = `Этаж с номером ${number} уже есть у этого объекта`;
    }
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    const scale = parseOptionalNumber(values.planScale);
    onSubmit({
      number: parseOptionalNumber(values.number) ?? 0,
      name: values.name.trim(),
      ...(scale === undefined ? {} : { planScale: scale }),
    });
  }

  const conflictNumber = serverNumberError(error);
  const fieldErrors: FloorFormErrors = {
    ...errors,
    ...(conflictNumber ? { number: conflictNumber } : {}),
  };
  const formError = conflictNumber ? null : error;

  return (
    <form
      id="floor-form"
      data-testid="floor-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {formError ? <ErrorBanner error={formError} /> : null}

      <Field label="Номер этажа" htmlFor="floor-number" required error={fieldErrors.number}>
        <Input
          id="floor-number"
          type="number"
          min={1}
          step="1"
          className="font-mono"
          value={values.number}
          invalid={Boolean(fieldErrors.number)}
          onChange={(event) => updateNumber(event.target.value)}
        />
      </Field>

      <Field label="Название" htmlFor="floor-name" required error={fieldErrors.name}>
        <Input
          id="floor-name"
          value={values.name}
          invalid={Boolean(fieldErrors.name)}
          maxLength={60}
          onChange={(event) => {
            update('name', event.target.value);
            setNameTouched(true);
          }}
        />
      </Field>

      <Field
        label="Масштаб плана, м/пкс"
        htmlFor="floor-plan-scale"
        hint="Необязательно: обычно задаётся вместе с планом"
        error={fieldErrors.planScale}
      >
        <Input
          id="floor-plan-scale"
          type="number"
          step="0.001"
          min={0}
          className="font-mono"
          value={values.planScale}
          invalid={Boolean(fieldErrors.planScale)}
          onChange={(event) => update('planScale', event.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="primary"
          type="submit"
          data-testid="floor-submit"
          loading={saving}
          disabled={saving}
        >
          {floor ? 'Сохранить' : 'Создать'}
        </Button>
      </div>
    </form>
  );
}
