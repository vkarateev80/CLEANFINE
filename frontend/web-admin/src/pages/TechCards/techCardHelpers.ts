import type { OperationMaterialPayload } from '../../types/core';

/**
 * Общие для двух экранов «Техкарты» правила: склонение русских подписей,
 * формат даты, разбор `equipment` и черновик операции.
 * Вынесено в модуль, а не в компонент: список и редактор показывают одни и те
 * же метрики («{n} операций · {m} помещений»), и расхождение формулировок
 * между экранами читается как разные данные.
 */

/** Склонение по русским правилам: 1 операция, 2 операции, 5 операций. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function operationsLabel(count: number): string {
  return `${count} ${plural(count, 'операция', 'операции', 'операций')}`;
}

export function roomsLabel(count: number): string {
  return `${count} ${plural(count, 'помещение', 'помещения', 'помещений')}`;
}

export function materialsLabel(count: number): string {
  return `${count} ${plural(count, 'материал', 'материала', 'материалов')}`;
}

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

/** Итог по операциям — локальный пересчёт, чтобы панель итогов не «запаздывала». */
export function sumMinutes(operations: Array<{ estimatedTimeMin: number }>): number {
  return operations.reduce((sum, operation) => sum + operation.estimatedTimeMin, 0);
}

/**
 * Разбор JSON оборудования. Пустая строка означает «поле не задано»: DTO
 * бэкенда принимает только объект (`@IsObject`) и не принимает `null`, поэтому
 * очистить значение через API нельзя — отправка поля просто пропускается.
 */
export type EquipmentParse =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; error: string };

export function parseEquipmentInput(raw: string): EquipmentParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: undefined };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    return { ok: false, error: `Невалидный JSON: ${message}` };
  }

  // Массив или число класс-валидатор `@IsObject()` отвергнет — ловим на клиенте,
  // иначе пользователь получит 400 без указания поля.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Оборудование должно быть JSON-объектом: { "items": [...] }' };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

/** Обратное преобразование: сохранённый JSON → текст в textarea. */
export function equipmentToText(equipment: Record<string, unknown> | null): string {
  if (equipment === null) return '';
  return JSON.stringify(equipment, null, 2);
}

export interface MaterialDraft extends OperationMaterialPayload {
  /** Локальный ключ строки: у новой строки ещё нет id материала-записи. */
  key: string;
}

export interface OperationFormValues {
  name: string;
  description: string;
  estimatedTimeMin: string;
  requiresPhoto: boolean;
  requiresQr: boolean;
  equipmentText: string;
  materials: MaterialDraft[];
}

export type OperationFormErrors = Partial<
  Record<'name' | 'estimatedTimeMin' | 'equipment' | 'materials', string>
>;

let materialKeySeed = 0;

export function newMaterialDraft(): MaterialDraft {
  materialKeySeed += 1;
  return {
    key: `material-${materialKeySeed}`,
    materialId: '',
    consumptionPerOperation: 0,
    unit: 'шт',
  };
}

export function emptyOperationForm(): OperationFormValues {
  return {
    name: '',
    description: '',
    estimatedTimeMin: '10',
    requiresPhoto: false,
    requiresQr: false,
    equipmentText: '',
    materials: [],
  };
}

/**
 * Клиентская валидация повторяет DTO бэкенда (`estimatedTimeMin` ≥ 1, расход > 0,
 * unit и materialId непустые): без неё пользователь узнаёт о проблеме из 400.
 */
export function validateOperationForm(values: OperationFormValues): OperationFormErrors {
  const errors: OperationFormErrors = {};

  const name = values.name.trim();
  if (name.length < 3) errors.name = 'Название: минимум 3 символа';
  else if (name.length > 120) errors.name = 'Название: максимум 120 символов';

  const time = Number(values.estimatedTimeMin);
  if (!Number.isInteger(time) || time < 1) {
    errors.estimatedTimeMin = 'Время — целое число, не меньше 1 минуты';
  }

  const equipment = parseEquipmentInput(values.equipmentText);
  if (!equipment.ok) errors.equipment = equipment.error;

  for (const [index, material] of values.materials.entries()) {
    if (material.materialId.trim() === '') {
      // Материал выбирается из справочника (`OperationFormModal`), поэтому
      // «укажите ID» больше не описывает действие пользователя.
      errors.materials = `Строка ${index + 1}: выберите материал`;
      break;
    }
    if (!(material.consumptionPerOperation > 0)) {
      errors.materials = `Строка ${index + 1}: расход должен быть больше 0`;
      break;
    }
    if (material.unit.trim() === '') {
      errors.materials = `Строка ${index + 1}: укажите единицу измерения`;
      break;
    }
  }

  return errors;
}
