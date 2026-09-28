import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { CreateOperationPayload, TechOperationWithMaterials } from '../../types/core';
import type { MaterialListItem } from '../../types/materials';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, errorMessage } from '../../components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { apiStatus, shortId } from '../Materials/materialsHelpers';
import { useMaterialsList, MAX_TAKE } from '../Materials/useMaterials';
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
 *
 * Материал строки выбирается из справочника material-service (М2.6 → М4): в
 * core-service у `OperationMaterial` нет названия, только `materialId`, поэтому
 * имя и единица приходят из `GET /api/materials` и тут же показываются рядом со
 * строкой — UUID не должен быть единственным ориентиром.
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

  // ── Справочник материалов ─────────────────────────────────────────────────
  // Поиск серверный (`search` в `ListMaterialsQueryDto` ищет по названию И
  // поставщику): клиентская фильтрация загруженной сотни не нашла бы материал,
  // который в неё не попал. `take: 100` — максимум, который принимает
  // material-service, поэтому выдача честно ограничена первыми 100 совпадениями.
  const [materialSearch, setMaterialSearch] = useState('');
  const debouncedSearch = useDebouncedValue(materialSearch, 300);
  const catalog = useMaterialsList({
    skip: 0,
    take: MAX_TAKE,
    ...(debouncedSearch.trim() === '' ? {} : { search: debouncedSearch.trim() }),
  });
  const catalogItems = useMemo(() => catalog.data?.items ?? [], [catalog.data]);

  /**
   * Материалы, которые форма уже видела. Нужны для двух случаев:
   *  • сохранённый `materialId` есть в справочнике, но не попал в текущую
   *    выдачу (серверный поиск отфильтровал) — подпись обязана остаться именем;
   *  • материал выбрали, потом изменили фильтр — выбранное значение не должно
   *    выглядеть как «нет в справочнике».
   */
  const [knownMaterials, setKnownMaterials] = useState<MaterialListItem[]>([]);
  useEffect(() => {
    const items = catalog.data?.items;
    if (!items || items.length === 0) return;
    setKnownMaterials((prev) => {
      const merged = new Map(prev.map((item) => [item.id, item]));
      for (const item of items) merged.set(item.id, item);
      return merged.size === prev.length ? prev : [...merged.values()];
    });
  }, [catalog.data]);

  const knownById = useMemo(
    () => new Map(knownMaterials.map((item) => [item.id, item])),
    [knownMaterials],
  );

  // Справочник «ответил» (успешно или ошибкой) — только тогда отсутствие id в
  // справочнике можно утверждать. Пока запрос идёт, «нет в справочнике» было бы
  // неправдой: материал мог просто ещё не приехать.
  const catalogSettled = catalog.isSuccess || catalog.isError;
  const catalogForbidden = apiStatus(catalog.error) === 403;

  /** Подпись материала строки: имя с единицей либо честная пометка про legacy. */
  function materialInfo(materialId: string): { label: string; missing: boolean } {
    if (materialId === '') return { label: 'Материал не выбран', missing: false };
    const known = knownById.get(materialId);
    if (known) return { label: `${known.name} (${known.unit})`, missing: false };
    if (!catalogSettled) return { label: 'Загружаем справочник…', missing: false };
    return { label: `${shortId(materialId)} — нет в справочнике`, missing: true };
  }

  /**
   * Выбор материала из справочника.
   *
   * Единицу подставляем всегда: норма и единица — свойства материала, а расхождение
   * «л» в справочнике и «шт» в строке почти наверняка опечатка. Поле при этом
   * остаётся редактируемым: единица операции может осознанно отличаться.
   * Расход подставляем ТОЛЬКО в пустую строку (0 или пусто): иначе выбор материала
   * затирал бы уже введённое число, которое как раз и отличается от нормы по
   * умолчанию — а его вводили руками и осознанно.
   */
  function pickMaterial(key: string, materialId: string) {
    const picked = knownById.get(materialId);
    setValues((prev) => ({
      ...prev,
      materials: prev.materials.map((row) => {
        if (row.key !== key) return row;
        if (!picked) return { ...row, materialId };
        return {
          ...row,
          materialId,
          unit: picked.unit,
          consumptionPerOperation:
            row.consumptionPerOperation > 0
              ? row.consumptionPerOperation
              : picked.defaultConsumption,
        };
      }),
    }));
  }

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

          {/* Справочник обязателен для выбора материала, но не для сохранения
              операции: ошибка загрузки оставляет уже указанные (legacy) значения
              и не мешает сохранить строку — форма не падает и не обнуляет id. */}
          {catalog.isError && (
            <p
              data-testid="operation-material-error"
              className="rounded-md bg-neutral-100 px-4 py-2 text-xs text-neutral-600"
            >
              {catalogForbidden
                ? 'Справочник материалов недоступен для вашей роли. Уже выбранные материалы сохранятся без изменений.'
                : `Не удалось загрузить справочник материалов: ${errorMessage(
                    catalog.error,
                  )}. Уже выбранные материалы сохранятся без изменений.`}
            </p>
          )}

          <Field
            label="Поиск материала"
            htmlFor={`${formId}-material-search`}
            hint="Серверный поиск по названию и поставщику; показываем первые 100 совпадений"
          >
            <Input
              id={`${formId}-material-search`}
              data-testid="operation-material-search"
              value={materialSearch}
              disabled={catalog.isError}
              placeholder="Например, «стекло»"
              onChange={(event) => setMaterialSearch(event.target.value)}
            />
          </Field>

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
                {values.materials.map((material, index) => {
                  const info = materialInfo(material.materialId);
                  // Значение вне текущей выдачи (материал удалён из справочника,
                  // заведён напрямую в core или отфильтрован поиском) обязано
                  // оставаться ВЫБРАННЫМ: без своей опции <select> показал бы
                  // пусто, а сохранение потеряло бы прежний materialId.
                  const outsideOptions =
                    material.materialId !== '' &&
                    catalogSettled &&
                    !catalogItems.some((item) => item.id === material.materialId);
                  return (
                    <Tr key={material.key}>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <Select
                            // Один и тот же testid у всех строк: базовый id обязателен
                            // для e2e, конкретная строка находится по `data-row-key`.
                            data-testid="operation-material-select"
                            data-row-key={material.key}
                            aria-label={`Материал строки ${index + 1}`}
                            className="min-w-[220px]"
                            value={material.materialId}
                            disabled={catalog.isLoading}
                            onChange={(event) => pickMaterial(material.key, event.target.value)}
                          >
                            <option value="">
                              {catalog.isLoading ? 'Загрузка…' : 'Выберите материал'}
                            </option>
                            {catalogItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.unit})
                              </option>
                            ))}
                            {outsideOptions && (
                              <option value={material.materialId}>{info.label}</option>
                            )}
                          </Select>
                          <span
                            data-testid="operation-material-name"
                            className={
                              info.missing ? 'text-xs text-neutral-400' : 'text-xs text-neutral-500'
                            }
                          >
                            {info.label}
                          </span>
                        </div>
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
                          onChange={(event) =>
                            patchMaterial(material.key, { unit: event.target.value })
                          }
                        />
                      </Td>
                      <Td align="right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Удалить материал ${info.label}`}
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
                  );
                })}
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
