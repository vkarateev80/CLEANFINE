import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { roomColorZone } from '@cleaning-ops/shared/types/color-coding';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, SoftWarning } from '../../components/ui/Feedback';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { plural } from '../../lib/date';
import {
  PhotoTooSmall,
  preparePhoto,
  revokePhotoPreview,
  type PreparedPhoto,
} from '../../lib/photo';
import { showToast } from '../../stores/uiStore';
import { OperationTile } from './OperationTile';
import { PhotoSheet } from './PhotoSheet';
import { useChecklist, type OperationView } from './useChecklist';

/** Чек-лист помещения (checklist.md): операции по порядку, таймер, фото, завершение. */
export function ChecklistPage() {
  const { eventId = '', roomId = '' } = useParams();
  const navigate = useNavigate();
  const checklist = useChecklist(eventId, roomId);
  const {
    event,
    route,
    room,
    techCard,
    operations,
    canWork,
    allDone,
    remaining,
    routeProgress,
    busyKey,
  } = checklist;

  const fileInput = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<OperationView | null>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);

  const floorNumber = route.data?.floor.number ?? null;
  const title = room.data
    ? `${room.data.name}${floorNumber !== null ? ` · ${floorNumber} этаж` : ''}`
    : 'Чек-лист';
  const roomZone = room.data
    ? roomColorZone({ floorType: room.data.floorType, zone: room.data.zone, name: room.data.name })
    : 'BLUE';

  function requestPhoto(view: OperationView) {
    setPhotoTarget(view);
    fileInput.current?.click();
  }

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const prepared = await preparePhoto(file);
      revokePhotoPreview(photo);
      setPhoto(prepared);
    } catch (error) {
      showToast(
        error instanceof PhotoTooSmall ? error.message : 'Не удалось обработать фото',
        'error',
      );
    }
  }

  async function confirmPhoto() {
    if (!photoTarget || !photo) return;
    const ok = await checklist.complete(photoTarget, photo);
    if (ok) {
      revokePhotoPreview(photo);
      setPhoto(null);
      setPhotoTarget(null);
    }
  }

  async function finishRoom() {
    const ok = await checklist.finishRoom();
    if (ok) {
      showToast('Помещение завершено', 'success');
      navigate(`/route/${eventId}`, { replace: true });
    }
  }

  const loading =
    event.isLoading ||
    room.isLoading ||
    (room.data?.techCardId && techCard.isLoading && !techCard.data);
  const loadError =
    (event.isError && !event.data) ||
    (room.isError && !room.data) ||
    (techCard.isError && !techCard.data);

  const body = (() => {
    if (loading) {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-lg bg-neutral-200" />
          ))}
        </div>
      );
    }
    if (loadError) {
      return (
        <ErrorBanner
          error={new Error('Не удалось загрузить чек-лист')}
          onRetry={() => {
            void event.refetch();
            void room.refetch();
            void techCard.refetch();
          }}
        />
      );
    }
    if (!room.data) return null;

    return (
      <div className="flex flex-col gap-4">
        {event.data && event.data.status !== 'CHECKED_IN' && (
          <SoftWarning>Смена не открыта — отметки недоступны</SoftWarning>
        )}
        {event.data && event.data.status === 'CHECKED_IN' && !event.data.ticketId && (
          <div className="rounded-lg border border-danger-500 bg-white px-4 py-3 text-sm text-danger-600">
            Заявка по смене не создана — отметки недоступны. Обратитесь к бригадиру
          </div>
        )}

        {routeProgress.total > 0 && (
          <div data-testid="checklist_progress_bar">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full bg-primary-500"
                style={{ width: `${(routeProgress.done / routeProgress.total) * 100}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Прогресс маршрута: <span className="font-mono">{routeProgress.done}</span> из{' '}
              <span className="font-mono">{routeProgress.total}</span>{' '}
              {plural(routeProgress.total, 'помещения', 'помещений', 'помещений')}
            </div>
          </div>
        )}

        {!room.data.techCardId ? (
          <EmptyState title="Техкарта не назначена" hint="Обратитесь к бригадиру" />
        ) : techCard.data && techCard.data.operations.length === 0 ? (
          <EmptyState title="В техкарте нет операций" hint="Обратитесь к бригадиру" />
        ) : techCard.data ? (
          <>
            <div className="text-sm text-neutral-500">
              Техкарта: {techCard.data.name} ·{' '}
              <span className="font-mono">{techCard.data.operations.length}</span>{' '}
              {plural(techCard.data.operations.length, 'операция', 'операции', 'операций')} · ~
              <span className="font-mono">{techCard.data.totalEstimatedTimeMin}</span> мин
            </div>
            <ol className="flex flex-col gap-3" data-testid="checklist_operations_list">
              {operations.map((view, index) => (
                <OperationTile
                  key={view.op.id}
                  view={view}
                  previousName={index > 0 ? operations[index - 1].op.name : null}
                  roomZone={roomZone}
                  canWork={canWork}
                  busy={busyKey === view.key}
                  onStart={() => checklist.start(view)}
                  onPhoto={() => requestPhoto(view)}
                  onComplete={() => void checklist.complete(view, null)}
                />
              ))}
            </ol>
          </>
        ) : null}
      </div>
    );
  })();

  const roomCompleteLabel = !room.data?.techCardId
    ? 'Считаю помещение выполненным'
    : allDone || operations.length === 0
      ? 'Завершить помещение'
      : `Завершить помещение (осталось ${remaining})`;
  const canFinish = canWork && Boolean(room.data) && (allDone || operations.length === 0);

  return (
    <FullscreenLayout
      title={title}
      backTo={`/route/${eventId}`}
      offlineText="Нет соединения — результат сохранится и синхронизируется"
      testId="checklist_page"
      bottom={
        room.data && !loading ? (
          <Button
            variant="primary"
            className={[
              'min-h-[52px] w-full',
              canFinish ? 'bg-success-600 hover:bg-success-600' : '',
            ].join(' ')}
            disabled={!canFinish}
            loading={busyKey === 'room'}
            onClick={() => void finishRoom()}
            data-testid={
              room.data.techCardId
                ? 'checklist_room_complete_button'
                : 'checklist_no_techcard_complete_button'
            }
          >
            {roomCompleteLabel}
          </Button>
        ) : undefined
      }
    >
      {body}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFileChosen(e)}
        data-testid="checklist_photo_input"
      />
      <PhotoSheet
        photo={photo}
        title={photoTarget ? `Фото операции ${photoTarget.op.orderIndex + 1}` : 'Фото'}
        roomName={room.data?.name ?? ''}
        busy={busyKey === photoTarget?.key}
        onRetake={() => fileInput.current?.click()}
        onConfirm={() => void confirmPhoto()}
        onClose={() => {
          revokePhotoPreview(photo);
          setPhoto(null);
        }}
      />
    </FullscreenLayout>
  );
}
