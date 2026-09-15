import type { ObjectStatus, RouteStatus } from '@cleaning-ops/shared/types/core';

/**
 * Типы ответов core-service. Поля повторяют `backend/core-service/prisma/schema.prisma`,
 * но даты — строки: axios отдаёт JSON, где `Date` уже сериализован в ISO 8601.
 *
 * Почему не сгенерировать из Prisma: web-admin не зависит от `@prisma/client`
 * (это клиент БД, ему не место в браузерной сборке). Дублирование осознанное —
 * типы проверяются контрактными e2e (`test/e2e/api/core.api.spec.ts`).
 */

export interface ObjectEntity {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  totalArea: number;
  floorsCount: number;
  clientName: string;
  clientContact: string;
  status: ObjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FloorEntity {
  id: string;
  objectId: string;
  number: number;
  name: string;
  planImageUrl: string | null;
  planScale: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TechCardRef {
  id: string;
  name: string;
}

export interface RoomEntity {
  id: string;
  floorId: string;
  name: string;
  areaM2: number;
  floorType: string;
  coordsX: number | null;
  coordsY: number | null;
  coordsWidth: number | null;
  coordsHeight: number | null;
  zone: string | null;
  techCardId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Помещение в ответе `GET /api/floors/:id/detail` — с подтянутой техкартой. */
export interface RoomWithTechCard extends RoomEntity {
  techCard: TechCardRef | null;
}

export interface RoutePointEntity {
  id: string;
  routeId: string;
  roomId: string;
  orderIndex: number;
  estimatedTimeMin: number | null;
}

export interface RoutePointWithRoom extends RoutePointEntity {
  room: RoomEntity;
}

export interface RouteEntity {
  id: string;
  floorId: string;
  name: string;
  status: RouteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RouteWithPoints extends RouteEntity {
  points: RoutePointEntity[];
}

export interface RouteDetail extends RouteEntity {
  floor: { id: string; name: string; number: number; planImageUrl: string | null };
  points: RoutePointWithRoom[];
  totalEstimatedTimeMin: number;
}

/** `GET /api/objects/:id/detail`: объект → этажи → помещения и маршруты. */
export interface ObjectDetail extends ObjectEntity {
  floors: Array<
    FloorEntity & {
      rooms: RoomEntity[];
      routes: RouteWithPoints[];
    }
  >;
}

/** `GET /api/floors/:id/detail` — основа экрана плана этажа. */
export interface FloorDetail extends FloorEntity {
  object: { id: string; name: string };
  rooms: RoomWithTechCard[];
  routes: RouteWithPoints[];
}

export interface TechCardEntity {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Элемент `GET /api/tech-cards` — с счётчиками вместо полных связей. */
export interface TechCardListItem extends TechCardEntity {
  _count: { operations: number; rooms: number };
}

export interface OperationMaterialEntity {
  id: string;
  operationId: string;
  materialId: string;
  consumptionPerOperation: number;
  unit: string;
}

export interface TechOperationEntity {
  id: string;
  techCardId: string;
  name: string;
  orderIndex: number;
  description: string | null;
  /** Произвольный JSON: структура ещё не формализована (см. «Открытые вопросы» DS-003). */
  equipment: Record<string, unknown> | null;
  estimatedTimeMin: number;
  requiresPhoto: boolean;
  requiresQr: boolean;
}

export interface TechOperationWithMaterials extends TechOperationEntity {
  materials: OperationMaterialEntity[];
}

export interface TechCardDetail extends TechCardEntity {
  operations: TechOperationWithMaterials[];
  rooms: Array<{ id: string; name: string; floor: { id: string; name: string; objectId: string } }>;
  totalEstimatedTimeMin: number;
}

export interface FileView {
  id: string;
  bucket: string;
  objectKey: string;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  watermarked: boolean;
  createdAt: string;
}

/** Формат постраничных ответов auth/file/core: `{ items, total }`. */
export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface PageQuery {
  skip?: number;
  take?: number;
}

export interface CreateObjectPayload {
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  totalArea: number;
  floorsCount: number;
  clientName: string;
  clientContact: string;
  status?: ObjectStatus;
}

export type UpdateObjectPayload = Partial<CreateObjectPayload>;

export interface CreateFloorPayload {
  number: number;
  name: string;
  planScale?: number;
}

export type UpdateFloorPayload = Partial<CreateFloorPayload>;

export interface CreateRoomPayload {
  name: string;
  areaM2: number;
  floorType: string;
  coordsX?: number;
  coordsY?: number;
  coordsWidth?: number;
  coordsHeight?: number;
  zone?: string;
  techCardId?: string;
}

/** `techCardId: null` отвязывает техкарту, отсутствие поля — «не менять». */
export type UpdateRoomPayload = Partial<Omit<CreateRoomPayload, 'techCardId'>> & {
  techCardId?: string | null;
};

export interface OperationMaterialPayload {
  materialId: string;
  consumptionPerOperation: number;
  unit: string;
}

export interface CreateOperationPayload {
  name: string;
  orderIndex?: number;
  description?: string;
  equipment?: Record<string, unknown>;
  estimatedTimeMin: number;
  requiresPhoto?: boolean;
  requiresQr?: boolean;
  materials?: OperationMaterialPayload[];
}

export type UpdateOperationPayload = Partial<CreateOperationPayload>;

export type UploadKind = 'photo' | 'plan' | 'avatar' | 'document';
export type EntityTypeName = 'FLOOR_PLAN' | 'TICKET' | 'CHAT_MESSAGE' | 'AVATAR' | 'DOCUMENT';
