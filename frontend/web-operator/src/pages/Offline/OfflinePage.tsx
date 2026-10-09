import { useState } from 'react';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { localTime, plural } from '../../lib/date';
import { retryItem, runQueue } from '../../lib/syncQueue';
import { deletePhoto } from '../../lib/photoStore';
import { useOnline } from '../../hooks/useOnline';
import { useQueueStore, type QueueItem, type QueueStatus } from '../../stores/queueStore';
import { showToast } from '../../stores/uiStore';

const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: 'Ожидает',
  sending: 'Отправляется…',
  failed: 'Ошибка',
  synced: 'Отправлено',
};

const STATUS_TONE: Record<QueueStatus, Tone> = {
  pending: 'warning',
  sending: 'primary',
  failed: 'danger',
  synced: 'success',
};

const KIND_ICON: Record<QueueItem['kind'], string> = {
  sos: '🚨',
  operation_complete: '✅',
  room_complete: '🏁',
  point_skip: '⏭',
  chat_message: '💬',
};

/** Очередь отправки (offline.md §2): статус, прогресс, повтор и удаление записей. */
export function OfflinePage() {
  const items = useQueueStore((s) => s.items);
  const remove = useQueueStore((s) => s.remove);
  const clearSynced = useQueueStore((s) => s.clearSynced);
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);

  const waiting = items.filter((it) => it.status !== 'synced');
  const synced = items.filter((it) => it.status === 'synced');

  async function syncNow() {
    setSyncing(true);
    try {
      const sent = await runQueue();
      showToast(
        sent > 0
          ? `Отправлено: ${sent}`
          : waiting.length > 0
            ? 'Пока не удалось отправить'
            : 'Очередь пуста',
        sent > 0 ? 'success' : 'info',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function removeItem(item: QueueItem) {
    const photoKey = item.payload.photoKey;
    if (typeof photoKey === 'string') await deletePhoto(photoKey).catch(() => undefined);
    remove(item.id);
  }

  return (
    <FullscreenLayout
      title="Очередь отправки"
      backTo="/today"
      showSos={false}
      testId="offline_page"
    >
      <div className="flex flex-col gap-4">
        <div
          className={[
            'rounded-lg border bg-white px-4 py-3 text-sm',
            online ? 'border-neutral-200 text-neutral-700' : 'border-warning-500 text-warning-600',
          ].join(' ')}
          data-testid="offline_status_banner"
        >
          {online ? 'Соединение есть' : 'Нет соединения'}
          {waiting.length > 0
            ? ` — ${waiting.length} ${plural(waiting.length, 'действие ждёт', 'действия ждут', 'действий ждут')} отправки`
            : ' — очередь пуста'}
        </div>
        {items.length > 0 && (
          <div className="text-xs text-neutral-500" data-testid="offline_progress_text">
            Отправлено <span className="font-mono">{synced.length}</span> из{' '}
            <span className="font-mono">{items.length}</span>
          </div>
        )}
        <Button
          variant="primary"
          className="min-h-[48px] w-full"
          loading={syncing}
          disabled={!online || waiting.length === 0}
          onClick={() => void syncNow()}
          data-testid="offline_sync_now_button"
        >
          Синхронизировать сейчас
        </Button>

        {items.length === 0 ? (
          <EmptyState title="Очередь пуста" hint="Все действия отправлены на сервер" />
        ) : (
          <ul
            className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white"
            data-testid="offline_queue_list"
          >
            {[...waiting, ...synced].map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 p-3"
                data-testid={`offline_item_${item.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm text-neutral-900">
                    <span aria-hidden="true">{KIND_ICON[item.kind]} </span>
                    {item.label}
                  </span>
                  <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                </div>
                <div className="text-xs text-neutral-500">
                  создано <span className="font-mono">{localTime(item.createdAt)}</span>
                  {item.attempts > 0 && (
                    <>
                      {' '}
                      · попыток: <span className="font-mono">{item.attempts}</span>
                    </>
                  )}
                  {item.lastError && item.status !== 'synced' && (
                    <span className="text-danger-600"> · {item.lastError}</span>
                  )}
                </div>
                {item.status !== 'synced' && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px]"
                      disabled={!online}
                      onClick={() => void retryItem(item.id)}
                      data-testid={`offline_item_retry_${item.id}`}
                    >
                      Повторить
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px] text-danger-600"
                      onClick={() => void removeItem(item)}
                      data-testid={`offline_item_delete_${item.id}`}
                    >
                      Удалить
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {synced.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] self-center"
            onClick={clearSynced}
          >
            Очистить отправленные
          </Button>
        )}
      </div>
    </FullscreenLayout>
  );
}
