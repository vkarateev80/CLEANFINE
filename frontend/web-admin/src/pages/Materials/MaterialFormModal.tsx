import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMaterial, updateMaterial } from '../../api/materials';
import { Button, ErrorBanner, Field, Input, Modal } from '../../components/ui';
import type { CreateMaterialPayload, MaterialEntity } from '../../types/materials';
import { parseRequiredNumber } from './materialsHelpers';

/**
 * Форма материала справочника (М4.3): создание и правка одной модалкой.
 *
 * Поля и ограничения — из `CreateMaterialDto` material-service: название и
 * единица обязательны, нормы/порог/цена — числа `≥ 0`, поставщик необязателен.
 * Правка доступна только ADMIN/SUPERVISOR (`@Roles` в контроллере), поэтому
 * кнопку открытия показывает `CatalogPanel` по `useCanManageMaterials`, а форма
 * дополнительно объясняет 403, если права изменились на сервере.
 */

interface FormState {
  name: string;
  unit: string;
  defaultConsumption: string;
  minStockThreshold: string;
  costPerUnit: string;
  supplier: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

function emptyForm(): FormState {
  return {
    name: '',
    unit: '',
    defaultConsumption: '',
    minStockThreshold: '',
    costPerUnit: '',
    supplier: '',
  };
}

function formFrom(material: MaterialEntity | null): FormState {
  if (!material) return emptyForm();
  return {
    name: material.name,
    unit: material.unit,
    defaultConsumption: String(material.defaultConsumption),
    minStockThreshold: String(material.minStockThreshold),
    costPerUnit: String(material.costPerUnit),
    supplier: material.supplier ?? '',
  };
}

/** Неотрицательное число; пустое значение и текст дают понятную подпись. */
function nonNegative(raw: string, label: string): { value: number } | { error: string } {
  const parsed = parseRequiredNumber(raw);
  if (Number.isNaN(parsed)) return { error: `${label} — число` };
  if (parsed < 0) return { error: `${label} — не меньше 0` };
  return { value: parsed };
}

export function MaterialFormModal({
  open,
  /** `null` — создание, иначе правка выбранного материала. */
  material,
  onClose,
  onSaved,
}: {
  open: boolean;
  material: MaterialEntity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormState>(() => formFrom(material));
  const [errors, setErrors] = useState<Errors>({});

  const save = useMutation({
    mutationFn: (input: { payload: CreateMaterialPayload; clearSupplier: boolean }) =>
      material
        ? updateMaterial(
            material.id,
            // `null` (а не отсутствие поля) — единственный способ очистить поставщика.
            input.clearSupplier ? { ...input.payload, supplier: null } : input.payload,
          )
        : createMaterial(input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
      onSaved();
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    save.reset();
  }

  function handleSubmit() {
    const next: Errors = {};
    const name = values.name.trim();
    const unit = values.unit.trim();
    if (name === '') next.name = 'Укажите название';
    if (unit === '') next.unit = 'Укажите единицу измерения';

    const consumption = nonNegative(values.defaultConsumption, 'Норма расхода');
    if ('error' in consumption) next.defaultConsumption = consumption.error;

    const threshold = nonNegative(values.minStockThreshold, 'Порог');
    if ('error' in threshold) next.minStockThreshold = threshold.error;

    const cost = nonNegative(values.costPerUnit, 'Цена');
    if ('error' in cost) next.costPerUnit = cost.error;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    if ('value' in consumption && 'value' in threshold && 'value' in cost) {
      const supplier = values.supplier.trim();
      save.mutate({
        payload: {
          name,
          unit,
          defaultConsumption: consumption.value,
          minStockThreshold: threshold.value,
          costPerUnit: cost.value,
          // Пустое поле на создании не отправляем вовсе: `supplier: null` в
          // `CreateMaterialDto` не описан (`@IsOptional() @IsString()`).
          ...(supplier === '' ? {} : { supplier }),
        },
        clearSupplier: supplier === '',
      });
    }
  }

  function handleClose() {
    setValues(formFrom(material));
    setErrors({});
    save.reset();
    onClose();
  }

  const title = material ? 'Материал' : 'Новый материал';
  const failure = save.isError ? save.error : null;

  return (
    <Modal
      open={open}
      title={title}
      size="lg"
      busy={save.isPending}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={save.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="material-submit"
            loading={save.isPending}
            onClick={handleSubmit}
          >
            {material ? 'Сохранить' : 'Создать материал'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="material-form">
        {failure ? <ErrorBanner error={failure} /> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Название" htmlFor="material-name" required error={errors.name}>
            <Input
              id="material-name"
              data-testid="material-name"
              value={values.name}
              invalid={Boolean(errors.name)}
              placeholder="Средство для мытья полов"
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>

          <Field
            label="Единица измерения"
            htmlFor="material-unit"
            required
            error={errors.unit}
            hint="л, мл, кг, шт"
          >
            <Input
              id="material-unit"
              data-testid="material-unit"
              value={values.unit}
              invalid={Boolean(errors.unit)}
              placeholder="л"
              onChange={(event) => update('unit', event.target.value)}
            />
          </Field>

          <Field
            label="Норма расхода"
            htmlFor="material-consumption"
            required
            error={errors.defaultConsumption}
            hint="На одну операцию техкарты"
          >
            <Input
              id="material-consumption"
              data-testid="material-consumption"
              className="font-mono"
              inputMode="decimal"
              value={values.defaultConsumption}
              invalid={Boolean(errors.defaultConsumption)}
              placeholder="0.05"
              onChange={(event) => update('defaultConsumption', event.target.value)}
            />
          </Field>

          <Field
            label="Порог минимального остатка"
            htmlFor="material-threshold"
            required
            error={errors.minStockThreshold}
            hint="Ниже порога остаток подсвечивается и публикуется material.low"
          >
            <Input
              id="material-threshold"
              data-testid="material-threshold"
              className="font-mono"
              inputMode="decimal"
              value={values.minStockThreshold}
              invalid={Boolean(errors.minStockThreshold)}
              placeholder="5"
              onChange={(event) => update('minStockThreshold', event.target.value)}
            />
          </Field>

          <Field
            label="Цена за единицу, ₽"
            htmlFor="material-cost"
            required
            error={errors.costPerUnit}
          >
            <Input
              id="material-cost"
              data-testid="material-cost"
              className="font-mono"
              inputMode="decimal"
              value={values.costPerUnit}
              invalid={Boolean(errors.costPerUnit)}
              placeholder="320.50"
              onChange={(event) => update('costPerUnit', event.target.value)}
            />
          </Field>

          <Field
            label="Поставщик"
            htmlFor="material-supplier"
            hint={material ? 'Пустое поле очищает поставщика' : 'Необязательно'}
          >
            <Input
              id="material-supplier"
              data-testid="material-supplier"
              value={values.supplier}
              placeholder="ООО «Химторг»"
              onChange={(event) => update('supplier', event.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
