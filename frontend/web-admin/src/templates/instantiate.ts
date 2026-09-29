import {
  addOperation,
  addRoutePoint,
  createFloor,
  createObject,
  createRoute,
  createTechCard,
  listRooms,
} from '../api/core';
import { createMaterial } from '../api/materials';
import type {
  MaterialSetTemplate,
  ObjectTemplate,
  RouteTemplate,
  TechCardTemplate,
} from './library';

/**
 * Разворачивание шаблона в реальные сущности через штатные API.
 *
 * Никакого отдельного хранения: техкарта создаётся и наполняется операциями,
 * объект — и этажами, маршрут — и точками, привязанными к помещениям этажа.
 * Порядок точек маршрута — чистая функция `planRoutePoints`, вынесенная ради
 * тестируемости: шаблон задаёт подписи и нормативы, этаж даёт помещения.
 */

export interface RoomRef {
  id: string;
  /** Метка создания: по ней восстанавливается порядок добавления помещений. */
  createdAt?: string;
}

export interface PlannedRoutePoint {
  roomId: string;
  label: string;
  estimatedTimeMin: number;
}

/**
 * Сопоставляет точки шаблона с помещениями этажа: сначала помещения
 * выравниваются по порядку добавления (createdAt — сервер отдаёт список
 * в своём порядке, который не обязан совпадать с хронологией), затем
 * первая точка → первое помещение и т. д. Точек в шаблоне может быть
 * больше помещений — лишние просто не создаются (обход покрывает то, что есть).
 */
export function planRoutePoints(template: RouteTemplate, rooms: RoomRef[]): PlannedRoutePoint[] {
  if (rooms.length === 0) {
    throw new Error(
      'На этаже нет помещений: добавьте хотя бы одно — точки маршрута привязываются к помещениям.',
    );
  }
  const ordered = [...rooms];
  if (rooms.every((room) => room.createdAt !== undefined)) {
    ordered.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }
  const count = Math.min(template.points.length, ordered.length);
  return template.points.slice(0, count).map((point, index) => ({
    roomId: ordered[index].id,
    label: point.label,
    estimatedTimeMin: point.estimatedTimeMin,
  }));
}

/** Техкарта: карточка + операции по порядку (orderIndex задаётся явно). */
export async function createTechCardFromTemplate(
  template: TechCardTemplate,
  name: string,
): Promise<string> {
  const card = await createTechCard(name);
  for (const [index, operation] of template.operations.entries()) {
    await addOperation(card.id, { ...operation, orderIndex: index });
  }
  return card.id;
}

/** Объект: сам объект + этажи «1 этаж»…«N этаж» (без планов — они загружаются отдельно). */
export async function createObjectFromTemplate(
  template: ObjectTemplate,
  name: string,
  clientName: string,
  clientContact: string,
): Promise<string> {
  const object = await createObject({
    ...template.preset,
    name,
    clientName,
    clientContact,
  });
  for (let number = 1; number <= template.preset.floorsCount; number += 1) {
    await createFloor(object.id, { number, name: `${number} этаж` });
  }
  return object.id;
}

/**
 * Маршрут: создание на выбранном этаже + точки по помещениям этажа.
 * Бросает ошибку с понятным текстом, если на этаже ещё нет помещений.
 */
export async function createRouteFromTemplate(
  template: RouteTemplate,
  floorId: string,
  name: string,
): Promise<string> {
  const rooms = await listRooms(floorId);
  const planned = planRoutePoints(template, rooms);
  const route = await createRoute(floorId, name);
  for (const point of planned) {
    await addRoutePoint(route.id, point.roomId, point.estimatedTimeMin);
  }
  return route.id;
}

/**
 * Набор материалов: каждая позиция создаётся отдельным POST. Позиции
 * независимы — упавшая запись (например, дубль названия) не срывает остальные;
 * если что-то не создалось, возвращается понятная ошибка со списком,
 * а созданные позиции не откатываются (справочник идемпотентен к осмотру).
 */
export async function createMaterialSetFromTemplate(
  template: MaterialSetTemplate,
): Promise<number> {
  let created = 0;
  const failures: string[] = [];
  for (const item of template.items) {
    try {
      await createMaterial(item);
      created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${item.name}: ${message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Создано ${created} из ${template.items.length}. Не создалось — ${failures.join('; ')}`,
    );
  }
  return created;
}
