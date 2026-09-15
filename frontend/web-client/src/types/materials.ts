import type { MovementType } from '@cleaning-ops/shared/types/materials';

/**
 * Типы ответов material-service (М4.3). Поля повторяют
 * `backend/material-service/prisma/schema.prisma`, но даты — строки: axios отдаёт
 * JSON, в котором `Date` уже сериализован в ISO 8601 (то же решение, что в
 * `src/types/core.ts` и `src/types/tickets.ts`).
 *
 * Словарь типов движений НЕ дублируется: `MOVEMENT_TYPES` и
 * `MOVEMENT_TYPE_LABELS` живут в `@cleaning-ops/shared/types/materials` — оттуда
 * их берёт и бэкенд (`@IsIn(MOVEMENT_TYPES)` в `CreateMovementDto`), поэтому
 * разойтись подписи и валидация не могут. Здесь они только реэкспортируются,
 * чтобы экраны импортировали домен из одного места.
 */

export { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from '@cleaning-ops/shared/types/materials';
export type { MovementType } from '@cleaning-ops/shared/types/materials';

// ── Справочник ─────────────────────────────────────────────────────────────

/** Материал (модель `Material`). */
export interface MaterialEntity {
  id: string;
  name: string;
  unit: string;
  /** Норма расхода по умолчанию (на операцию техкарты). */
  defaultConsumption: number;
  /** Порог минимального остатка: ниже него склад считается «мало». */
  minStockThreshold: number;
  costPerUnit: number;
  /** `null` — поставщик не указан; сброс делается `supplier: null` в PATCH. */
  supplier: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `include._count` в списке материалов (`MaterialsService.list`). */
export interface MaterialCounts {
  stocks: number;
  movements: number;
}

/** Элемент `GET /api/materials`. */
export interface MaterialListItem extends MaterialEntity {
  _count: MaterialCounts;
}

/** Строка склада внутри `GET /api/materials/:id` (модель `MaterialStock`). */
export interface MaterialStockEntity {
  id: string;
  materialId: string;
  objectId: string;
  quantity: number;
  updatedAt: string;
}

/** `GET /api/materials/:id` — материал с остатками по объектам. */
export interface MaterialDetailEntity extends MaterialEntity {
  stocks: MaterialStockEntity[];
}

// ── Остатки ────────────────────────────────────────────────────────────────

/**
 * Позиция `GET /api/materials/stocks` (`StockView` на бэкенде): остаток вместе с
 * названием материала и готовым признаком «ниже порога» — экран не пересчитывает
 * `quantity < minStockThreshold` сам, иначе правило порога разошлось бы с API.
 */
export interface StockView {
  materialId: string;
  objectId: string;
  quantity: number;
  minStockThreshold: number;
  belowThreshold: boolean;
  updatedAt: string;
  material: {
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
  };
}

// ── Движения ───────────────────────────────────────────────────────────────

/** Запись истории (`MaterialMovement`). */
export interface MaterialMovementEntity {
  id: string;
  materialId: string;
  objectId: string;
  type: MovementType;
  quantity: number;
  /** Заявка ticket-service, если движение связано с работой (FK между сервисами нет). */
  ticketId: string | null;
  /** id пользователя auth-service; `system:auto-consumption` — автосписание (М4.2). */
  userId: string;
  /** Объект-получатель: заполнен только у `TRANSFER`. */
  targetObjectId: string | null;
  createdAt: string;
}

/** Остаток после движения: `[{ objectId, quantity }]` (у `TRANSFER` — две записи). */
export interface MovementStockEffect {
  objectId: string;
  quantity: number;
}

/** Ответ `POST /api/materials/movements`. */
export interface CreateMovementResult {
  movement: MaterialMovementEntity;
  stocks: MovementStockEffect[];
}

// ── Отчёт ──────────────────────────────────────────────────────────────────

/** Агрегат расхода по одному материалу (`MaterialConsumptionRow`). */
export interface MaterialConsumptionRow {
  materialId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  /** Сумма `OUT` + `WRITE_OFF` за период. */
  consumedQuantity: number;
  /** Число операций (записей движений), а не количество материала. */
  operationsCount: number;
  cost: number;
}

/** `GET /api/materials/report` (`ConsumptionReport`). */
export interface ConsumptionReport {
  objectId: string | null;
  from: string | null;
  to: string | null;
  rows: MaterialConsumptionRow[];
  totals: {
    consumedQuantity: number;
    operationsCount: number;
    cost: number;
  };
}

// ── Запросы ────────────────────────────────────────────────────────────────

/**
 * Фильтры `GET /api/materials`: пагинация `skip`/`take` (соглашение сервисов,
 * `take` ≤ 100) плюс серверный поиск по названию и поставщику.
 */
export interface ListMaterialsQuery {
  skip?: number;
  take?: number;
  search?: string;
}

export interface ListMaterialsResult {
  items: MaterialListItem[];
  total: number;
}

/**
 * `GET /api/materials/stocks`. `onlyLow` передаётся ТОЛЬКО как `true`: в DTO
 * стоит `@Type(() => Boolean)`, а `Boolean('false') === true`, поэтому
 * `onlyLow=false` в query-строке включил бы фильтр вместо того, чтобы выключить
 * его. Отсутствие параметра = «все позиции».
 */
export interface StocksQuery {
  objectId?: string;
  onlyLow?: true;
}

export interface CreateMaterialPayload {
  name: string;
  unit: string;
  defaultConsumption: number;
  minStockThreshold: number;
  costPerUnit: number;
  supplier?: string;
}

/** `PATCH /api/materials/:id`: отсутствие поля — «не менять», `supplier: null` — очистить. */
export interface UpdateMaterialPayload {
  name?: string;
  unit?: string;
  defaultConsumption?: number;
  minStockThreshold?: number;
  costPerUnit?: number;
  supplier?: string | null;
}

export interface CreateMovementPayload {
  materialId: string;
  objectId: string;
  type: MovementType;
  quantity: number;
  /** Обязателен для `TRANSFER` и должен отличаться от `objectId` (иначе 400). */
  targetObjectId?: string;
  ticketId?: string;
}

/**
 * `GET /api/materials/:id/movements`: история одного материала. `skip` в
 * контракте нет — только `limit` (≤ 500), поэтому экран листает историю
 * увеличением лимита, а не страницами.
 */
export interface ListMovementsQuery {
  objectId?: string;
  /** ISO 8601 (`YYYY-MM-DD` из `<input type="date">`). */
  from?: string;
  to?: string;
  limit?: number;
}

export interface ListMovementsResult {
  items: MaterialMovementEntity[];
  total: number;
}

export interface ReportQuery {
  objectId?: string;
  from?: string;
  to?: string;
}
