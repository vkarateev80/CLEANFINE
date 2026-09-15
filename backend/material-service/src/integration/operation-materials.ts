/** Ответ core-service на `GET /api/rooms/:id` (нужен только techCardId). */
export interface RoomRef {
  id: string;
  techCardId?: string | null;
}

export interface TechOperationMaterialRef {
  materialId: string;
  consumptionPerOperation: number;
  unit?: string;
}

export interface TechOperationRef {
  id: string;
  name?: string;
  materials?: TechOperationMaterialRef[];
}

export interface TechCardRef {
  id: string;
  name?: string;
  operations?: TechOperationRef[];
}

/**
 * Материалы операции техкарты. `null` — получить не удалось (нет помещения,
 * нет техкарты, операция отсутствует, сервис недоступен): сообщение подтверждается
 * без списания. Пустой массив — операция есть, но материалов нет.
 */
export type OperationMaterials = TechOperationMaterialRef[] | null;
