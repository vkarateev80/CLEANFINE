import { apiClient } from './client';
import type { EntityTypeName, FileView, Paginated, PageQuery, UploadKind } from '../types/core';

/**
 * Клиент file-service (:3002 через прокси). Прямой вызов нужен там, где файл
 * загружается сам по себе (например, будущий фотоотчёт); для плана этажа
 * используется `uploadFloorPlan` из `api/core` — core-service сам сходит в
 * file-service и свяжет файл с этажом одной операцией.
 */

export interface UploadFileOptions {
  kind: UploadKind;
  /** Имя сотрудника для водяного знака (актуально для `kind: 'photo'`). */
  userName?: string;
  takenAt?: string;
  lat?: number;
  lng?: number;
}

export interface ListFilesQuery extends PageQuery {
  bucket?: string;
  entityType?: EntityTypeName;
  entityId?: string;
  uploadedById?: string;
}

export function uploadFile(file: File, options: UploadFileOptions): Promise<FileView> {
  const form = new FormData();
  // Порядок и имена полей заданы бэкендом (FileInterceptor('file') + UploadMetadataDto).
  form.append('file', file);
  form.append('kind', options.kind);
  if (options.userName) form.append('userName', options.userName);
  if (options.takenAt) form.append('takenAt', options.takenAt);
  if (options.lat !== undefined) form.append('lat', String(options.lat));
  if (options.lng !== undefined) form.append('lng', String(options.lng));
  return apiClient.post('/files/upload', form).then((r) => r.data);
}

export function getFile(id: string): Promise<FileView> {
  return apiClient.get(`/files/${id}`).then((r) => r.data);
}

export function listFiles(query: ListFilesQuery = {}): Promise<Paginated<FileView>> {
  return apiClient.get('/files', { params: query }).then((r) => r.data);
}

/** Привязка файла к сущности другого сервиса (кросс-сервисная ссылка по UUID). */
export function attachFile(
  id: string,
  entityType: EntityTypeName,
  entityId: string,
): Promise<{ id: string }> {
  return apiClient.post(`/files/${id}/attach`, { entityType, entityId }).then((r) => r.data);
}

export function listAttachments(entityType: EntityTypeName, entityId: string): Promise<FileView[]> {
  return apiClient.get(`/files/attachments/${entityType}/${entityId}`).then((r) => r.data);
}

export function deleteFile(id: string): Promise<void> {
  return apiClient.delete(`/files/${id}`).then(() => undefined);
}
