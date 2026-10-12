import type { ObjectStatus, RouteStatus } from '@cleaning-ops/shared/types/core';

/**
 * Типы ответов core-service, нужные оператору. Поля повторяют
 * `backend/core-service/prisma/schema.prisma`, даты — строки ISO (как в
 * web-admin/web-client: axios отдаёт уже сериализованный JSON).
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
  ownerClientId: string | null;
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
  /** Размеры плана в пикселях — система координат помещений (route_map.md §3.1). */
  planWidth: number | null;
  planHeight: number | null;
  planScale: number | null;
  createdAt: string;
  updatedAt: string;
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

export interface RoutePointEntity {
  id: string;
  routeId: string;
  roomId: string;
  orderIndex: number;
  estimatedTimeMin: number | null;
}

/** Точка маршрута с помещением и ссылкой на техкарту (`RoutesService.getDetail`). */
export interface RoutePointWithRoom extends RoutePointEntity {
  room: RoomEntity & {
    techCard: { id: string; operations: Array<{ id: string }> } | null;
  };
}

export interface RouteEntity {
  id: string;
  floorId: string;
  name: string;
  status: RouteStatus;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/routes/:id`. */
export interface RouteDetail extends RouteEntity {
  floor: {
    id: string;
    objectId: string;
    name: string;
    number: number;
    planImageUrl: string | null;
  };
  points: RoutePointWithRoom[];
  totalEstimatedTimeMin: number;
  /** Сколько операций чек-листов на маршруте (сумма по точкам, техкарта на двух комнатах — дважды). */
  operationsTotal: number;
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
  /** Произвольный JSON: `{items: [...], ppe: [...]}` или `key: value` (checklist.md §3.2). */
  equipment: Record<string, unknown> | null;
  estimatedTimeMin: number;
  requiresPhoto: boolean;
  requiresQr: boolean;
  materials: OperationMaterialEntity[];
}

/** `GET /api/tech-cards/:id`. */
export interface TechCardDetail {
  id: string;
  name: string;
  operations: TechOperationEntity[];
  rooms: Array<{
    id: string;
    name: string;
    floorType: string;
    zone: string | null;
    floor: { id: string; name: string; objectId: string };
  }>;
  totalEstimatedTimeMin: number;
  createdAt: string;
  updatedAt: string;
}

/** `UploadedFileView` file-service. */
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
