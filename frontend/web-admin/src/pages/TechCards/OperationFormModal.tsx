import { useId, useState, type FormEvent } from 'react';
import type { CreateOperationPayload, TechOperationWithMaterials } from '../../types/core';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import {
  emptyOperationForm,
  equipmentToText,
  newMaterialDraft,
  parseEquipmentInput,
  validateOperationForm,
  type MaterialDraft,
  type OperationFormErrors,
  type OperationFormValues,
} from './techCardHelpers';

/**
 * Модалка операции — одна на создание и редактирование: набор полей одинаков
 * (аккордеон 4.5 спецификации), различаются только подписи кнопки и вызов
 * `addOperation` / `updateOperation` на стороне страницы.
 *
 * Материалы передаются полным списком: бэкенд заменяет ими прежний состав
 * операции, поэтому «удалить строку» — это просто убрать её из формы.
 */
export interface OperationFormModalProps {
  open: boolean;
  /** `undefined` — создание, иначе редактирование этой операции. */
  operation?: TechOperationWithMaterials;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateOperationPayload) => Promise<void>;
}

const UNIT_OPTIONS = ['шт', 'мл', 'л', 'г', 'кг', 'уп'];

function initialValues(operation?: TechOperationWithMaterials): OperationFormValues {
  if (!operation) return emptyOperationForm();
  return {
    name: operation.name,
    description: operation.description ?? '',
    estimatedTimeMin: String(operation.estimatedTimeMin),
    requiresPhoto: operation.requiresPhoto,
    requiresQr: operation.requiresQr,
    equipmentText: equipmentToText(operation.equipment),
    materials: operation.materials.map((material) => ({
      key: material.id,
      materialId: material.materialId,
      consumptionPerOperation: material.consumptionPerOperation,
      unit: material.unit,
    })),
  };
}

export function OperationFormModal({
  open,
  operation,
  busy,
  onClose,
  onSubmit,
}: OperationFormModalProps) {
  const formId = useId();
  const [values, setValues] = useState<OperationFormValues>(() => initialValues(operation));
  const [errors, setErrors] = useState<OperationFormErrors>({});
  const [formError, setFormError] = useState<unknown>(null);

  function patch(changes: Partial<OperationFormValues>) {
    setValues((prev) => ({ ...prev, ...changes }));
  }

  // Локальный ключ строки менять нельзя — иначе React потеряет её при перерисовке.
  function patchMaterial(key: string, changes: Partial<Omit<MaterialDraft, 'key'>>) {
    setValues((prev) => ({
      ...prev,
      materials: prev.materials.map((material) =>
        material.key === key ? { ...material, ...changes } : material,
      ),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors = validateOperationForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // JSON уже проверен валидацией выше, но парсим ещё раз, чтобы получить объект,
    // а не строку: DTO бэкенда объявлено как `@IsObject()`.
    const equipment = parseEquipmentInput(values.equipmentText);
    if (!equipment.ok) {
      setErrors((prev) => ({ ...prev, equipment: equipment.error }));
      return;
    }

    const payload: CreateOperationPayload = {
      name: values.name.trim(),
      estimatedTimeMin: Number(values.estimatedTimeMin),
      requiresPhoto: values.requiresPhoto,
      requiresQr: values.requiresQr,
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      ...(equipment.value ? { equipment: equipment.value } : {}),
      materials: values.materials.map((material) => ({
        materialId: material.materialId.trim(),
        consumptionPerOperation: Number(material.consumptionPerOperation),
        unit: material.unit.trim(),
      })),
    };

    try {
      await onSubmit(payload);
    } catch (error) {
      setFormError(error);
    }
  }

  return (
    <Modal
      open={open}
      size="lg"
      busy={busy}
      onClose={onClose}
      title={operation ? `Операция «${operation.name}»` : 'Новая операция'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" form={formId} loading={busy} data-testid="operation-submit">
            {operation ? 'Сохранить операцию' : 'Добавить операцию'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        data-testid="operation-form"
        onSubmit={handleSubmit}
        className={['flex flex-col gap-4', busy ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {Boolean(formError) && <ErrorBanner error={formError} />}

        <Field label="Название" htmlFor={`${formId}-name`} required error={errors.name}>
          <Input
            id={`${formId}-name`}
            data-testid="operation-name"
            value={values.name}
            invalid={Boolean(errors.name)}
            placeholder="Например, «Нанести чистящее средство»"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>

        <Field label="Описание" htmlFor={`${formId}-description`} hint="До 1000 символов">
          <Textarea
            id={`${formId}-description`}
            data-testid="operation-description"
            rows={4}
            maxLength={1000}
            value={values.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Время, мин"
            htmlFor={`${formId}-time`}
            required
            error={errors.estimatedTimeMin}
          >
            <Input
              id={`${formId}-time`}
              data-testid="operation-time"
              type="number"
              min={1}
              step={1}
              invalid={Boolean(errors.estimatedTimeMin)}
              value={values.estimatedTimeMin}
              onChange={(event) => patch({ estimatedTimeMin: event.target.value })}
            />
          </Field>

          <div className="flex items-center gap-6 pt-6">
            <Checkbox
              label="Требуется фото"
              checked={values.requiresPhoto}
              onChange={(event) => patch({ requiresPhoto: event.target.checked })}
            />
            <Checkbox
              label="Требуется QR"
              checked={values.requiresQr}
              onChange={(event) => patch({ requiresQr: event.target.checked })}
            />
          </div>
        </div>

        <Field
          label="Оборудование (JSON)"
          htmlFor={`${formId}-equipment`}
          hint='Объект вида { "items": ["швабра"], "ppe": ["перчатки"] }. Пусто — не задано.'
          error={errors.equipment}
        >
          <Textarea
            id={`${formId}-equipment`}
            data-testid="operation-equipment"
            rows={4}
            spellCheck={false}
            className="font-mono text-sm"
            invalid={Boolean(errors.equipment)}
            value={values.equipmentText}
            placeholder='{ "items": ["швабра", "ведро"] }'
            onChange={(event) => patch({ equipmentText: event.target.value })}
          />
        </Field>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-neutral-900">Материалы операции</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="operation-material-add"
              onClick={() =>
                setValues((prev) => ({
                  ...prev,
                  materials: [...prev.materials, newMaterialDraft()],
                }))
              }
            >
              + Материал
            </Button>
          </div>

          {/* До М4 справочника материалов нет: id вводится строкой (см. 4.6 спецификации). */}
          <p className="rounded-md bg-neutral-100 px-4 py-2 text-xs text-neutral-600">
            Справочник материалов появится в М4. Сейчас идентификатор указывается вручную.
          </p>

          {errors.materials && <span className="text-xs text-danger-600">{errors.materials}</span>}

          {values.materials.length === 0 ? (
            <p className="text-xs text-neutral-400">Материалы не заданы.</p>
          ) : (
            <Table>
              <THead>
                <Th>Материал</Th>
                <Th align="right">Расход на операцию</Th>
                <Th>Единица</Th>
                <Th />
              </THead>
              <TBody>
                {values.materials.map((material) => (
                  <Tr key={material.key}>
                    <Td>
                      <Input
                        value={material.materialId}
                        className="font-mono"
                        placeholder="ID материала (справочник — М4)"
                        aria-label="ID материала"
                        onChange={(event) =>
                          patchMaterial(material.key, { materialId: event.target.value })
                        }
                      />
                    </Td>
                    <Td align="right">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-28 text-right font-mono"
                        aria-label="Расход на операцию"
                        value={material.consumptionPerOperation}
                        onChange={(event) =>
                          patchMaterial(material.key, {
                            consumptionPerOperation: Number(event.target.value),
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <Input
                        list={`${formId}-units`}
                        className="w-24"
                        aria-label="Единица измерения"
                        value={material.unit}
                        onChange={(event) => patchMaterial(material.key, { unit: event.target.value })}
                      />
                    </Td>
                    <Td align="right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Удалить материал ${material.materialId || 'без названия'}`}
                        onClick={() =>
                          setValues((prev) => ({
                            ...prev,
                            materials: prev.materials.filter((row) => row.key !== material.key),
                          }))
                        }
                      >
                        ✕
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}

          <datalist id={`${formId}-units`}>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </section>
      </form>
    </Modal>
  );
}
