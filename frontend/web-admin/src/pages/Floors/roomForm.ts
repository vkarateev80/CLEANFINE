import type { CreateRoomPayload, RoomEntity, UpdateRoomPayload } from '../../types/core';
import { type PlanSize, type Rect } from './floorPlanUtils';

/**
 * Модель формы помещения и преобразование в payload.
 * Числа хранятся строками: пустое поле `input type="number"` — это `''`, и только
 * строка позволяет отличить «не задано» от «0» до отправки на бэкенд.
 */

export interface RoomFormValues {
  name: string;
  areaM2: string;
  floorType: string;
  zone: string;
  techCardId: string;
  coordsX: string;
  coordsY: string;
  coordsWidth: string;
  coordsHeight: string;
}

export interface RoomFormErrors {
  name?: string;
  areaM2?: string;
  floorType?: string;
  coordsX?: string;
  coordsY?: string;
  coordsWidth?: string;
  coordsHeight?: string;
  /** Общая ошибка прямоугольника: вне границ плана. */
  coords?: string;
}

export function emptyRoomFormValues(): RoomFormValues {
  return {
    name: '',
    areaM2: '',
    floorType: '',
    zone: '',
    techCardId: '',
    coordsX: '',
    coordsY: '',
    coordsWidth: '',
    coordsHeight: '',
  };
}

export function roomFormValues(room: RoomEntity): RoomFormValues {
  return {
    name: room.name,
    areaM2: String(room.areaM2),
    floorType: room.floorType,
    zone: room.zone ?? '',
    techCardId: room.techCardId ?? '',
    coordsX: room.coordsX === null ? '' : String(room.coordsX),
    coordsY: room.coordsY === null ? '' : String(room.coordsY),
    coordsWidth: room.coordsWidth === null ? '' : String(room.coordsWidth),
    coordsHeight: room.coordsHeight === null ? '' : String(room.coordsHeight),
  };
}

export function withRect(values: RoomFormValues, rect: Rect): RoomFormValues {
  return {
    ...values,
    coordsX: String(rect.x),
    coordsY: String(rect.y),
    coordsWidth: String(rect.width),
    coordsHeight: String(rect.height),
  };
}

/** Площадь уходит на сервер с точностью 0,1 м² (14.10.2026) — как и хранится. */
export function roundArea(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Прямоугольник из формы; `null`, если хотя бы одно поле пустое. */
export function rectFromForm(values: RoomFormValues): Rect | null {
  const x = parseNumber(values.coordsX);
  const y = parseNumber(values.coordsY);
  const width = parseNumber(values.coordsWidth);
  const height = parseNumber(values.coordsHeight);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

export function hasFormErrors(errors: RoomFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

type CoordKey = 'coordsX' | 'coordsY' | 'coordsWidth' | 'coordsHeight';

const COORD_KEYS: CoordKey[] = ['coordsX', 'coordsY', 'coordsWidth', 'coordsHeight'];

/**
 * Клиентская проверка повторяет правила бэкенда: целые ≥ 0 (стороны ≥ 1),
 * прямоугольник внутри размеров изображения, площадь > 0, название не пустое.
 * `planSize === null` (SVG без размеров или не загрузившееся изображение) —
 * границы проверить нечем, тогда решение остаётся за сервером.
 */
export function validateRoomForm(
  values: RoomFormValues,
  planSize: PlanSize | null,
): RoomFormErrors {
  const errors: RoomFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Укажите название помещения';
  } else if (name.length > 80) {
    errors.name = 'Не более 80 символов';
  }

  const area = parseNumber(values.areaM2);
  if (area === null) {
    errors.areaM2 = 'Укажите площадь';
  } else if (area <= 0) {
    errors.areaM2 = 'Площадь должна быть больше 0';
  }

  if (values.floorType.trim() === '') {
    errors.floorType = 'Укажите тип помещения';
  }

  const filled = COORD_KEYS.filter((key) => values[key].trim() !== '');
  if (filled.length > 0 && filled.length < COORD_KEYS.length) {
    COORD_KEYS.filter((key) => values[key].trim() === '').forEach((key) => {
      errors[key] = 'Заполните все четыре координаты';
    });
  } else if (filled.length === COORD_KEYS.length) {
    COORD_KEYS.forEach((key) => {
      const parsed = parseNumber(values[key]);
      if (parsed === null || !Number.isInteger(parsed)) {
        errors[key] = 'Целое число';
      } else if (parsed < 0) {
        errors[key] = 'Не меньше 0';
      } else if ((key === 'coordsWidth' || key === 'coordsHeight') && parsed < 1) {
        errors[key] = 'Не меньше 1 px';
      }
    });

    const rect = rectFromForm(values);
    const fieldErrors =
      errors.coordsX ?? errors.coordsY ?? errors.coordsWidth ?? errors.coordsHeight;
    if (rect && planSize && !fieldErrors) {
      if (rect.x + rect.width > planSize.width || rect.y + rect.height > planSize.height) {
        errors.coords = `Прямоугольник выходит за границы плана ${planSize.width}×${planSize.height} px`;
      }
    }
  }

  return errors;
}

function coordsPayload(values: RoomFormValues): Partial<CreateRoomPayload> {
  const rect = rectFromForm(values);
  if (!rect) return {};
  return {
    coordsX: rect.x,
    coordsY: rect.y,
    coordsWidth: rect.width,
    coordsHeight: rect.height,
  };
}

export function roomCreatePayload(values: RoomFormValues): CreateRoomPayload {
  const payload: CreateRoomPayload = {
    name: values.name.trim(),
    areaM2: roundArea(parseNumber(values.areaM2) ?? 0),
    floorType: values.floorType.trim(),
    ...coordsPayload(values),
  };
  const zone = values.zone.trim();
  if (zone !== '') payload.zone = zone;
  if (values.techCardId !== '') payload.techCardId = values.techCardId;
  return payload;
}

/** `techCardId: null` отвязывает техкарту; пустая зона очищает поле. */
export function roomUpdatePayload(values: RoomFormValues): UpdateRoomPayload {
  return {
    name: values.name.trim(),
    areaM2: roundArea(parseNumber(values.areaM2) ?? 0),
    floorType: values.floorType.trim(),
    zone: values.zone.trim(),
    techCardId: values.techCardId === '' ? null : values.techCardId,
    ...coordsPayload(values),
  };
}
