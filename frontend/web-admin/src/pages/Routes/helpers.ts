import type { FloorEntity, RoomEntity } from '../../types/core';

/**
 * Мелкие вычисления конструктора маршрутов. Вынесены из компонентов, потому что
 * одни и те же правила (центр помещения, разбор времени, подпись этажа) нужны
 * и списку точек, и плану, и модалке добавления — копии разошлись бы.
 *
 * `ROUTE_STATUSES` и подписи статусов берутся напрямую из `types/status`, чтобы
 * у экрана не появилось второго словаря статусов.
 */

/** Центр прямоугольника помещения в пикселях плана — там ставится маркер точки. */
export function roomCenter(room: RoomEntity): { x: number; y: number } | null {
  if (room.coordsX === null || room.coordsY === null) return null;
  return {
    x: room.coordsX + (room.coordsWidth ?? 0) / 2,
    y: room.coordsY + (room.coordsHeight ?? 0) / 2,
  };
}

export function hasCoords(room: RoomEntity): boolean {
  return room.coordsX !== null && room.coordsY !== null;
}

/** Подпись этажа в селектах: «{number}. {name}». */
export function floorLabel(floor: FloorEntity): string {
  return `${floor.number}. ${floor.name}`;
}

export function floorShortName(floor: { number: number; name: string }): string {
  return `Этаж ${floor.number}. ${floor.name}`;
}

/**
 * Оценка времени хранится на сервере как `Int?`. `null` означает «норму не
 * задавали», а не «0 минут», поэтому в поле показывается пустая строка —
 * иначе пользователь увидит ноль и не поймёт, что значение не сохранено.
 */
export function timeToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

/** `null` — «очистить», `undefined` — «некорректно, отправлять нельзя». */
export function inputToTime(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  // Бэкенд (`UpdateRoutePointDto`) отвергает всё, что меньше 1: 0 — не «нет
  // времени», а недопустимое значение, поэтому такое поле не отправляем.
  if (value < 1) return undefined;
  return value;
}

/** Сумма времени точек; пустые/некорректные значения считаются нулём. */
export function sumDraftTime(values: string[]): number {
  return values.reduce((sum, raw) => {
    const parsed = inputToTime(raw);
    return sum + (typeof parsed === 'number' ? parsed : 0);
  }, 0);
}

export function defaultRouteName(): string {
  return `Маршрут ${new Date().toLocaleDateString('ru-RU')}`;
}

export function zoneLabel(room: RoomEntity): string {
  return room.zone && room.zone.trim().length > 0 ? room.zone : 'зона не задана';
}

export function floorTypeLabel(room: RoomEntity): string {
  return room.floorType && room.floorType.trim().length > 0 ? room.floorType : 'тип не задан';
}
