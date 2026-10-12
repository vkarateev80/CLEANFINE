import { apiClient } from './client';
import type {
  FloorEntity,
  ObjectEntity,
  RoomEntity,
  RouteDetail,
  TechCardDetail,
} from '../types/core';

/**
 * Клиент core-service: оператор только ЧИТАЕТ объект, этаж, помещение, маршрут
 * и техкарту своей смены (DS-002 overview.md п. 2). Ни одной мутации здесь нет
 * и быть не должно — справочники правит админка.
 */
export function getObject(id: string): Promise<ObjectEntity> {
  return apiClient.get(`/objects/${id}`).then((r) => r.data);
}

export function getFloor(id: string): Promise<FloorEntity> {
  return apiClient.get(`/floors/${id}`).then((r) => r.data);
}

export function getRoom(id: string): Promise<RoomEntity> {
  return apiClient.get(`/rooms/${id}`).then((r) => r.data);
}

export function getRoute(id: string): Promise<RouteDetail> {
  return apiClient.get(`/routes/${id}`).then((r) => r.data);
}

export function getTechCard(id: string): Promise<TechCardDetail> {
  return apiClient.get(`/tech-cards/${id}`).then((r) => r.data);
}
