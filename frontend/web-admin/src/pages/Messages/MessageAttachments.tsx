import { useQuery } from '@tanstack/react-query';
import { getFile } from '../../api/files';
import type { FileView } from '../../types/core';
import { formatBytes } from '../Objects/utils';

/**
 * Вложения сообщения (12.10.2026): по id из file-service — картинка миниатюрой
 * (по нажатию открывается оригинал), видео — встроенным плеером, остальное —
 * ссылкой с именем и размером. Метаданные кэшируются навсегда: файл неизменяем.
 */
export function useAttachment(id: string) {
  return useQuery({
    queryKey: ['file', id],
    queryFn: () => getFile(id),
    staleTime: Infinity,
    retry: 1,
  });
}

export function isImageFile(file: Pick<FileView, 'mimeType'>): boolean {
  return file.mimeType.startsWith('image/');
}

export function isVideoFile(file: Pick<FileView, 'mimeType'>): boolean {
  return file.mimeType.startsWith('video/');
}

export function MessageAttachments({ ids, mine }: { ids: string[]; mine: boolean }) {
  if (ids.length === 0) return null;
  return (
    <div
      className="mt-1 flex max-w-[85%] flex-wrap gap-2"
      data-testid="message-attachments"
    >
      {ids.map((id) => (
        <Attachment key={id} id={id} mine={mine} />
      ))}
    </div>
  );
}

function Attachment({ id, mine }: { id: string; mine: boolean }) {
  const file = useAttachment(id);
  if (file.isLoading) {
    return <div className="h-24 w-32 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  }
  if (file.isError || !file.data) {
    return (
      <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
        📎 вложение недоступно
      </span>
    );
  }
  const data = file.data;
  if (isImageFile(data)) {
    return (
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        title={data.originalName}
        data-testid={`attachment-image-${id}`}
        className="block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
      >
        <img
          src={data.thumbnailUrl ?? data.url}
          alt={data.originalName}
          loading="lazy"
          className="max-h-48 max-w-[240px] object-cover"
        />
      </a>
    );
  }
  if (isVideoFile(data)) {
    return (
      <video
        src={data.url}
        controls
        preload="metadata"
        data-testid={`attachment-video-${id}`}
        className="max-h-56 max-w-[280px] rounded-lg border border-neutral-200 bg-black"
      />
    );
  }
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      data-testid={`attachment-file-${id}`}
      className={[
        'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs',
        mine
          ? 'border-primary-200 bg-primary-50 text-primary-700'
          : 'border-neutral-200 bg-neutral-50 text-neutral-700',
      ].join(' ')}
    >
      📎 <span className="max-w-[200px] truncate">{data.originalName}</span>
      <span className="text-neutral-400">{formatBytes(data.sizeBytes)}</span>
    </a>
  );
}

/** Что можно прикрепить в чате: фото, видео, PDF. Совпадает с `ALLOWED_MIME.chat` file-service. */
export const CHAT_ATTACHMENT_ACCEPT = 'image/*,video/*,application/pdf,.xml,application/xml,text/xml';
export const CHAT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_COUNT = 10;

export function isXmlAttachment(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    file.type === 'application/xml' ||
    file.type === 'text/xml' ||
    file.name.toLowerCase().endsWith('.xml')
  );
}

export function attachmentError(file: File): string | null {
  const okType =
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    file.type === 'application/pdf' ||
    isXmlAttachment(file);
  if (!okType) return `«${file.name}»: можно прикрепить фото, видео, PDF или XML`;
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return `«${file.name}» больше 50 МБ`;
  return null;
}
