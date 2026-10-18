import { useQuery } from '@tanstack/react-query';
import { getFile } from '../../api/files';
import type { FileView } from '../../types/core';
import { t } from '../../i18n';

/**
 * Вложения сообщения (12.10.2026): фото — миниатюрой с открытием оригинала,
 * видео — встроенным плеером, остальное — ссылкой. Метаданные файла неизменны,
 * поэтому кэшируются без срока.
 */
export function useAttachment(id: string) {
  return useQuery({
    queryKey: ['file', id],
    queryFn: () => getFile(id),
    staleTime: Infinity,
    retry: 1,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t('Б')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${t('КБ')}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${t('МБ')}`;
}

/**
 * Любые рабочие файлы (14.10.2026): фото, видео, аудио, документы, архивы.
 * Запрещены только исполняемые файлы, скрипты и html/svg — список тот же,
 * что `BLOCKED_EXTENSIONS` в file-service.
 */
export const CHAT_ATTACHMENT_ACCEPT = '*/*';
export const CHAT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_COUNT = 10;
export const CHAT_BLOCKED_EXTENSIONS = [
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.ps1', '.sh', '.bash',
  '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.jar', '.php', '.phtml', '.cgi',
  '.html', '.htm', '.xhtml', '.svg', '.svgz', '.hta', '.dll', '.so', '.dmg', '.app',
];

export function isBlockedAttachment(file: Pick<File, 'name'>): boolean {
  const lower = file.name.toLowerCase();
  return CHAT_BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function attachmentIcon(file: { mimeType?: string; type?: string; name?: string }): string {
  const mime = (file.mimeType ?? file.type ?? '').toLowerCase();
  const name = (file.name ?? '').toLowerCase();
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📕';
  if (/word|rtf|odt|\.docx?$/.test(mime + ' ' + name)) return '📝';
  if (/sheet|excel|csv|ods|\.xlsx?$/.test(mime + ' ' + name)) return '📊';
  if (/presentation|powerpoint|odp|\.pptx?$/.test(mime + ' ' + name)) return '📽';
  if (/zip|rar|7z|gzip|\.(zip|rar|7z|gz)$/.test(mime + ' ' + name)) return '📦';
  return '📎';
}

export function attachmentError(file: File): string | null {
  if (isBlockedAttachment(file)) {
    return t('«{name}»: исполняемые файлы, скрипты, HTML и SVG прикреплять нельзя', { name: file.name });
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return t('«{name}» больше 50 МБ', { name: file.name });
  if (file.size === 0) return t('«{name}»: файл пустой', { name: file.name });
  return null;
}

export function MessageAttachments({ ids, mine }: { ids: string[]; mine: boolean }) {
  if (ids.length === 0) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-2" data-testid="chat_message_attachments">
      {ids.map((id) => (
        <Attachment key={id} id={id} mine={mine} />
      ))}
    </div>
  );
}

function Attachment({ id, mine }: { id: string; mine: boolean }) {
  const file = useAttachment(id);
  if (file.isLoading) {
    return <div className="h-28 w-36 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  }
  if (file.isError || !file.data) {
    return (
      <span
        className={[
          'rounded-lg border px-2 py-1 text-xs',
          mine ? 'border-white/40 text-white/80' : 'border-neutral-200 text-neutral-500',
        ].join(' ')}
      >
        {t('📎 вложение недоступно')}
      </span>
    );
  }
  const data: FileView = file.data;
  if (data.mimeType.startsWith('image/')) {
    return (
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        title={data.originalName}
        data-testid={`chat_attachment_image_${id}`}
        className="block overflow-hidden rounded-lg bg-neutral-100"
      >
        <img
          src={data.thumbnailUrl ?? data.url}
          alt={data.originalName}
          loading="lazy"
          className="max-h-56 max-w-[70vw] object-cover"
        />
      </a>
    );
  }
  if (data.mimeType.startsWith('video/')) {
    return (
      <video
        src={data.url}
        controls
        playsInline
        preload="metadata"
        data-testid={`chat_attachment_video_${id}`}
        className="max-h-64 max-w-[70vw] rounded-lg bg-black"
      />
    );
  }
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      data-testid={`chat_attachment_file_${id}`}
      className={[
        'inline-flex max-w-[70vw] items-center gap-2 rounded-lg border px-2 py-1 text-xs',
        mine ? 'border-white/40 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-700',
      ].join(' ')}
    >
      {attachmentIcon({ mimeType: data.mimeType, name: data.originalName })}{' '}
      <span className="truncate">{data.originalName}</span>
      <span className={mine ? 'text-white/70' : 'text-neutral-400'}>
        {formatBytes(data.sizeBytes)}
      </span>
    </a>
  );
}
