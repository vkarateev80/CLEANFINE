import { useEffect, useState } from 'react';
import {
  COLOR_ZONE_META,
  colorZoneFromZoneField,
  operationColorZone,
  type ColorZone,
} from '@cleaning-ops/shared/types/color-coding';
import { Button } from '../../components/ui/Button';
import { mmss, plural } from '../../lib/date';
import type { OperationView } from './useChecklist';

/**
 * Строка операции техкарты (checklist.md §3.2): номер, название, таймер,
 * оборудование в цвете зоны, фото, действия. Заблокирована, пока не
 * завершена предыдущая.
 */
export function OperationTile({
  view,
  previousName,
  roomZone,
  canWork,
  busy,
  onStart,
  onPhoto,
  onComplete,
}: {
  view: OperationView;
  previousName: string | null;
  roomZone: ColorZone;
  canWork: boolean;
  busy: boolean;
  onStart: () => void;
  onPhoto: () => void;
  onComplete: () => void;
}) {
  const { op, done, locked, current, local } = view;
  const [expanded, setExpanded] = useState(false);
  const seconds = useTimer(current && canWork && !done ? local.startedAt : undefined);
  const overBy = seconds - op.estimatedTimeMin * 60;
  const opZone = operationColorZone(op.name, roomZone);
  const equipment = parseEquipment(op.equipment);
  const statusLabel = done
    ? local.pendingSync
      ? 'Отправляется…'
      : 'Выполнено'
    : current
      ? 'В работе'
      : 'Ожидает';

  return (
    <li
      className={[
        'rounded-lg border bg-white shadow-sm',
        locked && !done
          ? 'border-neutral-200 bg-neutral-100'
          : current
            ? 'border-2 border-primary-500'
            : 'border-neutral-200',
      ].join(' ')}
      data-testid={`checklist_op_tile_${op.id}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 p-3 text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span
          className={[
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            done
              ? 'bg-success-500 text-white'
              : current
                ? 'bg-primary-500 text-white'
                : locked
                  ? 'bg-neutral-300 text-neutral-500'
                  : 'bg-neutral-200 text-neutral-700',
          ].join(' ')}
          data-testid={`checklist_op_status_${op.id}`}
          aria-label={statusLabel}
        >
          {done ? '✓' : locked ? '🔒' : op.orderIndex + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={[
              'block text-base font-medium',
              done
                ? 'text-neutral-500 line-through'
                : locked
                  ? 'text-neutral-400'
                  : 'text-neutral-900',
            ].join(' ')}
          >
            {op.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            {!locked && (
              <span
                className={[
                  'font-mono',
                  overBy > 0 && !done ? 'text-warning-600' : 'text-neutral-700',
                ].join(' ')}
                data-testid={`checklist_op_timer_${op.id}`}
              >
                ⏱ {mmss(seconds)}
              </span>
            )}
            <span>норма {op.estimatedTimeMin} мин</span>
            {overBy > 0 && !done && (
              <span className="text-warning-600">+{mmss(overBy)} сверх нормы</span>
            )}
            {op.requiresPhoto && !done && (
              <span className="text-danger-600" data-testid={`checklist_op_photo_hint_${op.id}`}>
                📷 Фото обязательно
              </span>
            )}
            {op.requiresQr && <span>Требуется QR</span>}
            <span className="text-neutral-400">· {statusLabel}</span>
          </span>
          {locked && !done && previousName && (
            <span
              className="mt-1 block text-xs text-neutral-500"
              data-testid={`checklist_op_locked_${op.id}`}
            >
              Доступно после операции «{previousName}»
            </span>
          )}
        </span>
        {local.photoUrl && (
          <img
            src={local.photoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md object-cover"
            data-testid={`checklist_op_photo_thumb_${op.id}`}
          />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-neutral-200 px-3 py-2 text-sm">
          {op.description && <p className="text-neutral-700">{op.description}</p>}
          {equipment.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {equipment.map((item) => {
                const zone = colorZoneFromZoneField(item.label) ?? opZone;
                const meta = COLOR_ZONE_META[zone];
                return (
                  <span
                    key={`${item.group}-${item.label}`}
                    className="rounded-full border px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: meta.hexSoft,
                      borderColor: meta.hex,
                      color: meta.hexDark,
                    }}
                  >
                    {item.group === 'ppe' ? '🧤 ' : ''}
                    {item.label}
                  </span>
                );
              })}
            </div>
          )}
          {op.materials.length > 0 && (
            <p className="text-xs" style={{ color: COLOR_ZONE_META[opZone].hexDark }}>
              Материалы: {op.materials.length} {plural(op.materials.length, 'поз.', 'поз.', 'поз.')}
              ; спишет сервер
            </p>
          )}
        </div>
      )}

      {canWork && !done && !locked && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-200 px-3 py-2">
          {!local.startedAt && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              onClick={onStart}
              data-testid={`checklist_op_start_button_${op.id}`}
            >
              Начать
            </Button>
          )}
          {op.requiresPhoto && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px] flex-1"
              onClick={onPhoto}
              disabled={busy}
              data-testid={`checklist_op_photo_button_${op.id}`}
            >
              📷 {local.photoUrl ? 'Переснять' : 'Сделать фото'}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px] flex-1"
            onClick={onComplete}
            loading={busy}
            data-testid={`checklist_op_complete_button_${op.id}`}
          >
            Завершить
          </Button>
        </div>
      )}
    </li>
  );
}

/** Секунды с `startedAt` по wall-clock (таймер переживает перезагрузку). */
function useTimer(startedAt: string | undefined): number {
  const compute = () =>
    startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0;
  const [seconds, setSeconds] = useState(compute);
  useEffect(() => {
    setSeconds(compute());
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setSeconds(compute()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return seconds;
}

interface EquipmentItem {
  group: 'items' | 'ppe' | 'other';
  label: string;
}

/** `{items: [...], ppe: [...]}` → чипы; иной JSON — `ключ: значение` (checklist.md §3.2). */
export function parseEquipment(value: Record<string, unknown> | null): EquipmentItem[] {
  if (!value || typeof value !== 'object') return [];
  const result: EquipmentItem[] = [];
  const pushList = (group: EquipmentItem['group'], list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list)
      if (typeof entry === 'string' && entry.trim()) result.push({ group, label: entry.trim() });
  };
  pushList('items', value.items);
  pushList('ppe', value.ppe);
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'items' || key === 'ppe') continue;
    if (typeof entry === 'string' || typeof entry === 'number')
      result.push({ group: 'other', label: `${key}: ${entry}` });
  }
  return result;
}
