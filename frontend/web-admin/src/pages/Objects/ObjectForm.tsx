import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorBanner, Field, Input, Select } from '../../components/ui';
import type { CreateObjectPayload, ObjectEntity } from '../../types/core';
import {
  OBJECT_STATUSES,
  OBJECT_STATUS_LABELS,
  type ObjectStatus,
} from '../../types/status';
import { COMMON_OBJECT_TYPES, apiMessages, parseRequiredNumber } from './utils';

export interface ObjectFormValues {
  name: string;
  address: string;
  type: string;
  lat: string;
  lng: string;
  totalArea: string;
  floorsCount: string;
  clientName: string;
  clientContact: string;
  status: ObjectStatus;
}

export type ObjectFormErrors = Partial<Record<keyof ObjectFormValues, string>>;

function toFormValues(object?: ObjectEntity): ObjectFormValues {
  if (!object) {
    return {
      name: '',
      address: '',
      type: '',
      lat: '',
      lng: '',
      totalArea: '',
      floorsCount: '1',
      clientName: '',
      clientContact: '',
      status: 'ACTIVE',
    };
  }
  return {
    name: object.name,
    address: object.address,
    type: object.type,
    lat: String(object.lat),
    lng: String(object.lng),
    totalArea: String(object.totalArea),
    floorsCount: String(object.floorsCount),
    clientName: object.clientName,
    clientContact: object.clientContact,
    status: object.status,
  };
}

/** Валидация повторяет DTO бэкенда (`create-object.dto`), но с русскими текстами. */
export function validateObject(values: ObjectFormValues): ObjectFormErrors {
  const errors: ObjectFormErrors = {};

  const name = values.name.trim();
  if (name.length < 3 || name.length > 120) {
    errors.name = 'Название — от 3 до 120 символов';
  }

  const address = values.address.trim();
  if (address.length < 5 || address.length > 200) {
    errors.address = 'Адрес — от 5 до 200 символов';
  }

  if (values.type.trim() === '') {
    errors.type = 'Укажите тип объекта';
  }

  const lat = parseRequiredNumber(values.lat);
  if (Number.isNaN(lat)) errors.lat = 'Укажите широту';
  else if (lat < -90 || lat > 90) errors.lat = 'Широта — от −90 до 90';

  const lng = parseRequiredNumber(values.lng);
  if (Number.isNaN(lng)) errors.lng = 'Укажите долготу';
  else if (lng < -180 || lng > 180) errors.lng = 'Долгота — от −180 до 180';

  const totalArea = parseRequiredNumber(values.totalArea);
  if (Number.isNaN(totalArea)) errors.totalArea = 'Укажите площадь';
  else if (totalArea <= 0) errors.totalArea = 'Площадь должна быть больше 0';

  const floorsCount = parseRequiredNumber(values.floorsCount);
  if (Number.isNaN(floorsCount)) errors.floorsCount = 'Укажите количество этажей';
  else if (!Number.isInteger(floorsCount)) errors.floorsCount = 'Количество этажей — целое число';
  else if (floorsCount < 1) errors.floorsCount = 'Укажите хотя бы один этаж';

  const clientName = values.clientName.trim();
  if (clientName.length < 2 || clientName.length > 120) {
    errors.clientName = 'Клиент — от 2 до 120 символов';
  }

  const clientContact = values.clientContact.trim();
  if (clientContact.length < 5 || clientContact.length > 120) {
    errors.clientContact = 'Контакт — от 5 до 120 символов';
  }

  return errors;
}

/** Сообщение class-validator называет поле по имени в DTO — по нему подсвечиваем контрол. */
const SERVER_FIELD_KEYS: Array<keyof ObjectFormValues> = [
  'name',
  'address',
  'type',
  'lat',
  'lng',
  'totalArea',
  'floorsCount',
  'clientName',
  'clientContact',
  'status',
];

export function serverFieldErrors(error: unknown): ObjectFormErrors {
  const errors: ObjectFormErrors = {};
  for (const message of apiMessages(error)) {
    const lower = message.toLowerCase();
    for (const key of SERVER_FIELD_KEYS) {
      if (lower.includes(key.toLowerCase()) && !errors[key]) {
        errors[key] = message;
      }
    }
  }
  return errors;
}

export interface ObjectFormProps {
  /** Без объекта — режим создания. */
  object?: ObjectEntity;
  saving: boolean;
  error: unknown;
  onSubmit: (payload: CreateObjectPayload) => void;
  onCancel: () => void;
  /** Родитель решает, что делать с изменённой формой при попытке закрытия. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function ObjectForm({
  object,
  saving,
  error,
  onSubmit,
  onCancel,
  onDirtyChange,
}: ObjectFormProps) {
  const [initial] = useState<ObjectFormValues>(() => toFormValues(object));
  const [values, setValues] = useState<ObjectFormValues>(initial);
  const [errors, setErrors] = useState<ObjectFormErrors>({});

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function update<K extends keyof ObjectFormValues>(key: K, value: ObjectFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateObject(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    onSubmit({
      name: values.name.trim(),
      address: values.address.trim(),
      type: values.type.trim(),
      lat: parseRequiredNumber(values.lat),
      lng: parseRequiredNumber(values.lng),
      totalArea: parseRequiredNumber(values.totalArea),
      floorsCount: parseRequiredNumber(values.floorsCount),
      clientName: values.clientName.trim(),
      clientContact: values.clientContact.trim(),
      status: values.status,
    });
  }

  // Ошибки DTO показываем у самих полей, общий баннер остаётся для сети и 403.
  const fieldErrors: ObjectFormErrors = { ...serverFieldErrors(error), ...errors };
  const formError = Object.keys(serverFieldErrors(error)).length > 0 ? null : error;

  return (
    <form
      id="object-form"
      data-testid="object-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {formError ? <ErrorBanner error={formError} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Название" htmlFor="object-name" required error={fieldErrors.name}>
          <Input
            id="object-name"
            value={values.name}
            invalid={Boolean(fieldErrors.name)}
            maxLength={120}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field label="Адрес" htmlFor="object-address" required error={fieldErrors.address}>
          <Input
            id="object-address"
            value={values.address}
            invalid={Boolean(fieldErrors.address)}
            maxLength={200}
            onChange={(event) => update('address', event.target.value)}
          />
        </Field>

        <Field
          label="Тип объекта"
          htmlFor="object-type"
          required
          hint="Справочник типов ещё не утверждён — можно ввести своё значение"
          error={fieldErrors.type}
        >
          <Input
            id="object-type"
            list="object-type-options"
            value={values.type}
            invalid={Boolean(fieldErrors.type)}
            maxLength={80}
            onChange={(event) => update('type', event.target.value)}
          />
          <datalist id="object-type-options">
            {COMMON_OBJECT_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </Field>

        <Field label="Статус" htmlFor="object-status" required error={fieldErrors.status}>
          <Select
            id="object-status"
            value={values.status}
            invalid={Boolean(fieldErrors.status)}
            onChange={(event) => update('status', event.target.value as ObjectStatus)}
          >
            {OBJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {OBJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Широта" htmlFor="object-lat" required error={fieldErrors.lat}>
          <Input
            id="object-lat"
            type="number"
            step="0.000001"
            min={-90}
            max={90}
            className="font-mono"
            value={values.lat}
            invalid={Boolean(fieldErrors.lat)}
            onChange={(event) => update('lat', event.target.value)}
          />
        </Field>

        <Field label="Долгота" htmlFor="object-lng" required error={fieldErrors.lng}>
          <Input
            id="object-lng"
            type="number"
            step="0.000001"
            min={-180}
            max={180}
            className="font-mono"
            value={values.lng}
            invalid={Boolean(fieldErrors.lng)}
            onChange={(event) => update('lng', event.target.value)}
          />
        </Field>

        <Field
          label="Общая площадь, м²"
          htmlFor="object-total-area"
          required
          error={fieldErrors.totalArea}
        >
          <Input
            id="object-total-area"
            type="number"
            step="0.1"
            min={0}
            className="font-mono"
            value={values.totalArea}
            invalid={Boolean(fieldErrors.totalArea)}
            onChange={(event) => update('totalArea', event.target.value)}
          />
        </Field>

        <Field
          label="Количество этажей"
          htmlFor="object-floors-count"
          required
          error={fieldErrors.floorsCount}
        >
          <Input
            id="object-floors-count"
            type="number"
            min={1}
            step="1"
            className="font-mono"
            value={values.floorsCount}
            invalid={Boolean(fieldErrors.floorsCount)}
            onChange={(event) => update('floorsCount', event.target.value)}
          />
        </Field>

        <Field label="Клиент" htmlFor="object-client-name" required error={fieldErrors.clientName}>
          <Input
            id="object-client-name"
            value={values.clientName}
            invalid={Boolean(fieldErrors.clientName)}
            maxLength={120}
            onChange={(event) => update('clientName', event.target.value)}
          />
        </Field>

        <Field
          label="Контакт клиента"
          htmlFor="object-client-contact"
          required
          hint="Телефон или email"
          error={fieldErrors.clientContact}
        >
          <Input
            id="object-client-contact"
            value={values.clientContact}
            invalid={Boolean(fieldErrors.clientContact)}
            maxLength={120}
            onChange={(event) => update('clientContact', event.target.value)}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="primary"
          type="submit"
          data-testid="object-submit"
          loading={saving}
          disabled={saving}
        >
          {object ? 'Сохранить' : 'Создать'}
        </Button>
      </div>

      {dirty && !saving ? (
        <span className="text-right text-xs text-neutral-400">Есть несохранённые изменения</span>
      ) : null}
    </form>
  );
}
