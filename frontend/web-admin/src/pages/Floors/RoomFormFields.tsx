import { ErrorBanner, Field, Input, PresetInput, Select, errorMessage } from '../../components/ui';
import { presetValues } from '../../templates/presets';
import type { TechCardListItem } from '../../types/core';
import { isCoordsError, rectAreaHint, type PlanSize } from './floorPlanUtils';
import { rectFromForm, type RoomFormErrors, type RoomFormValues } from './roomForm';

interface RoomFormFieldsProps {
  idPrefix: string;
  values: RoomFormValues;
  errors: RoomFormErrors;
  onChange: (patch: Partial<RoomFormValues>) => void;
  techCards: TechCardListItem[];
  planSize: PlanSize | null;
  planScale: number | null;
  /** Без плана координаты задать нельзя — бэкенд отвергает их с 400. */
  coordsDisabled: boolean;
  disabled?: boolean;
  /** Ошибка запроса: 400 по координатам подсвечиваем у самих полей. */
  serverError?: unknown;
  /** Известные типы помещений этажа — подсказка в datalist. */
  floorTypeOptions: string[];
}

const COORD_FIELDS: Array<{ key: CoordKey; label: string }> = [
  { key: 'coordsX', label: 'X' },
  { key: 'coordsY', label: 'Y' },
  { key: 'coordsWidth', label: 'Ш' },
  { key: 'coordsHeight', label: 'В' },
];

type CoordKey = 'coordsX' | 'coordsY' | 'coordsWidth' | 'coordsHeight';

/** Патч по одному полю: вычисляемый ключ union-типа TS выводит слишком широко. */
function coordPatch(key: CoordKey, value: string): Partial<RoomFormValues> {
  if (key === 'coordsX') return { coordsX: value };
  if (key === 'coordsY') return { coordsY: value };
  if (key === 'coordsWidth') return { coordsWidth: value };
  return { coordsHeight: value };
}

/** Поля помещения: одни и те же в модалке создания и в drawer правки. */
export function RoomFormFields({
  idPrefix,
  values,
  errors,
  onChange,
  techCards,
  planSize,
  planScale,
  coordsDisabled,
  disabled,
  serverError,
  floorTypeOptions,
}: RoomFormFieldsProps) {
  const rect = rectFromForm(values);
  const areaHint = rectAreaHint(rect, planScale);
  const coordsServerError = isCoordsError(serverError) ? errorMessage(serverError) : null;
  // Тип помещения: уже встречавшиеся на этаже значения + библиотека
  // (виды помещений и покрытия) — единый список без дублей.
  const typeOptions = [
    ...new Set([...floorTypeOptions, ...presetValues('room-types', 'floor-coverings')]),
  ];

  return (
    <div className="flex flex-col gap-4">
      {Boolean(serverError) && <ErrorBanner error={serverError} />}

      <Field label="Название" htmlFor={`${idPrefix}-name`} required error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          value={values.name}
          maxLength={80}
          disabled={disabled}
          invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>

      {/* На телефоне (<768 px) форма одноколоночная: `sm:grid-cols-2` включается
          уже с 640 px, то есть внутри телефонного диапазона, и в fullscreen-модалке
          на 640–767 px давал бы два узких поля вместо одного нормального. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-md:grid-cols-1">
        <Field
          label="Площадь, м²"
          htmlFor={`${idPrefix}-area`}
          required
          error={errors.areaM2}
          hint={areaHint === null ? undefined : `по геометрии ≈ ${areaHint.toFixed(1)} м²`}
        >
          <Input
            id={`${idPrefix}-area`}
            name="areaM2"
            type="number"
            step="0.1"
            min="0"
            className="font-mono"
            value={values.areaM2}
            disabled={disabled}
            invalid={Boolean(errors.areaM2)}
            onChange={(event) => onChange({ areaM2: event.target.value })}
          />
        </Field>

        <Field
          label="Тип помещения"
          htmlFor={`${idPrefix}-type`}
          required
          error={errors.floorType}
          hint="Виды помещения и покрытия из библиотеки — или своё значение"
        >
          <PresetInput
            id={`${idPrefix}-type`}
            name="floorType"
            value={values.floorType}
            disabled={disabled}
            invalid={Boolean(errors.floorType)}
            options={typeOptions}
            onValueChange={(next) => onChange({ floorType: next })}
          />
        </Field>

        <Field label="Зона" htmlFor={`${idPrefix}-zone`}>
          <PresetInput
            id={`${idPrefix}-zone`}
            name="zone"
            value={values.zone}
            placeholder="zone-a"
            disabled={disabled}
            options={presetValues('zones')}
            onValueChange={(next) => onChange({ zone: next })}
          />
        </Field>

        <Field label="Техкарта" htmlFor={`${idPrefix}-tech-card`}>
          <Select
            id={`${idPrefix}-tech-card`}
            name="techCardId"
            value={values.techCardId}
            disabled={disabled}
            onChange={(event) => onChange({ techCardId: event.target.value })}
          >
            <option value="">Не выбрана</option>
            {/* Техкарта могла не попасть в первые 100 записей справочника — не теряем её. */}
            {values.techCardId !== '' &&
              !techCards.some((techCard) => techCard.id === values.techCardId) && (
                <option value={values.techCardId}>Текущая техкарта</option>
              )}
            {techCards.map((techCard) => (
              <option key={techCard.id} value={techCard.id}>
                {techCard.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset
        className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3"
        disabled={disabled}
      >
        <legend className="px-1 text-sm text-neutral-500">Координаты, px</legend>
        {/* Четыре координаты в строку (desktop/планшет). На телефоне — по две в
            ряд: поле x/y/ширина/высота в 60 px шириной нечитаемо, а именно эта
            форма на телефоне и есть основной путь создания помещения. */}
        <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
          {COORD_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`${idPrefix}-${field.key}`}
              error={errors[field.key]}
            >
              <Input
                id={`${idPrefix}-${field.key}`}
                name={field.key}
                type="number"
                step="1"
                min="0"
                className="font-mono"
                value={values[field.key]}
                disabled={coordsDisabled}
                invalid={Boolean(errors[field.key])}
                onChange={(event) => onChange(coordPatch(field.key, event.target.value))}
              />
            </Field>
          ))}
        </div>
        {errors.coords && <span className="text-xs text-danger-600">{errors.coords}</span>}
        {!errors.coords && coordsServerError && (
          <span className="text-xs text-danger-600">{coordsServerError}</span>
        )}
        {coordsDisabled ? (
          <span className="text-xs text-warning-600">
            Без плана координаты задать нельзя: сначала загрузите изображение этажа.
          </span>
        ) : (
          planSize && (
            <span className="text-xs text-neutral-400">
              Границы плана: {planSize.width}×{planSize.height} px
            </span>
          )
        )}
      </fieldset>
    </div>
  );
}
