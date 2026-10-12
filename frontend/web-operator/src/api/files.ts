import { apiClient } from './client';
import type { FileView } from '../types/core';

export interface UploadPhotoMeta {
  userName?: string;
  takenAt?: string;
  lat?: number;
  lng?: number;
}

/**
 * Загрузка фото в file-service: водяной знак (имя, время, координаты), миниатюра
 * и проверка «≥1280×720» делаются на сервере (`kind=photo`). Таймаут больше
 * обычного: на мобильной сети 2–4 МБ уходят дольше 10 с.
 */
export function uploadPhoto(
  file: Blob,
  fileName: string,
  meta: UploadPhotoMeta = {},
): Promise<FileView> {
  const form = new FormData();
  form.append('file', file, fileName);
  form.append('kind', 'photo');
  if (meta.userName) form.append('userName', meta.userName);
  if (meta.takenAt) form.append('takenAt', meta.takenAt);
  if (meta.lat !== undefined) form.append('lat', String(meta.lat));
  if (meta.lng !== undefined) form.append('lng', String(meta.lng));
  return apiClient
    .post('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    })
    .then((r) => r.data);
}

/** Привязка файла к сущности — так фото SOS оказывается во вложениях заявки. */
export function attachFile(
  fileId: string,
  entityType: 'TICKET' | 'CHAT_MESSAGE',
  entityId: string,
): Promise<{ id: string }> {
  return apiClient.post(`/files/${fileId}/attach`, { entityType, entityId }).then((r) => r.data);
}

/** Таймаут загрузки вложений: видео с телефона на мобильной сети идёт минутами. */
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Вложение чата (12.10.2026): `kind=chat` — без водяного знака и проверки
 * разрешения, фото/видео/PDF до 50 МБ. `onProgress` — проценты отправки.
 */
export function uploadChatFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileView> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('kind', 'chat');
  return apiClient
    .post('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      },
    })
    .then((r) => r.data);
}

/** Метаданные файла (вложение сообщения): url, миниатюра, тип, размер. */
export function getFile(id: string): Promise<FileView> {
  return apiClient.get(`/files/${id}`).then((r) => r.data);
}
