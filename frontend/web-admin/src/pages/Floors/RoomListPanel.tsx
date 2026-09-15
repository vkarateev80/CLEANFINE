import { useMemo, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import type { RoomWithTechCard } from '../../types/core';
import {
  ROOM_SORT_OPTIONS,
  distinctRoomValues,
  filterAndSortRooms,
  formatArea,
  formatRoomCoords,
  roomNumbers,
  type Rect,
  type RoomSort,
} from './floorPlanUtils';

interface RoomListPanelProps {
  rooms: RoomWithTechCard[];
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  canEdit: boolean;
  /** Несохранённые координаты после сдвига на плане — показываем актуальные. */
  draftRects: Record<string, Rect>;
  onSelect: (roomId: string | null) => void;
  onHover: (roomId: string | null) => void;
  onCreate: () => void;
}

function TechCardPill({ room }: { room: RoomWithTechCard }) {
  if (room.techCard) {
    return (
      <span className="inline-flex rounded-full border border-neutral-200 bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
        {room.techCard.name}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-warning-500 bg-white px-2 py-0.5 text-xs text-warning-600">
      Техкарта не выбрана
    </span>
  );
}

/** Левая панель «Экспликация»: поиск, фильтры, сортировка и итог по площади. */
export function RoomListPanel({
  rooms,
  selectedRoomId,
  hoveredRoomId,
  canEdit,
  draftRects,
  onSelect,
  onHover,
  onCreate,
}: RoomListPanelProps) {
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [floorType, setFloorType] = useState('');
  const [sort, setSort] = useState<RoomSort>('order');

  const zones = useMemo(() => distinctRoomValues(rooms, 'zone'), [rooms]);
  const floorTypes = useMemo(() => distinctRoomValues(rooms, 'floorType'), [rooms]);
  const numbers = useMemo(() => roomNumbers(rooms), [rooms]);
  const visible = useMemo(
    () => filterAndSortRooms(rooms, { search, zone, floorType, sort }),
    [rooms, search, zone, floorType, sort],
  );

  const totalArea = rooms.reduce((sum, room) => sum + room.areaM2, 0);
  const filtersActive = search.trim() !== '' || zone !== '' || floorType !== '';

  function resetFilters() {
    setSearch('');
    setZone('');
    setFloorType('');
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-neutral-200 p-4">
        <div className="text-sm font-medium text-neutral-900">Экспликация</div>
        <div className="mt-1 text-xs text-neutral-500">
          <span className="font-mono">{rooms.length}</span> помещений ·{' '}
          <span className="font-mono">{formatArea(totalArea)}</span> м²
          {filtersActive && (
            <>
              {' '}
              · показано <span className="font-mono">{visible.length}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-neutral-200 p-4">
        <Input
          value={search}
          placeholder="Поиск по названию"
          aria-label="Поиск помещений"
          data-testid="room-search"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={zone}
            aria-label="Фильтр по зоне"
            onChange={(event) => setZone(event.target.value)}
          >
            <option value="">Все зоны</option>
            {zones.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={floorType}
            aria-label="Фильтр по типу помещения"
            onChange={(event) => setFloorType(event.target.value)}
          >
            <option value="">Все типы</option>
            {floorTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        <Select
          value={sort}
          aria-label="Сортировка помещений"
          onChange={(event) => {
            const next = ROOM_SORT_OPTIONS.find((option) => option.value === event.target.value);
            if (next) setSort(next.value);
          }}
        >
          {ROOM_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex-1">
        {rooms.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-sm text-neutral-400">Помещений пока нет</span>
            {canEdit && (
              <Button size="sm" onClick={onCreate}>
                Добавить помещение
              </Button>
            )}
          </div>
        )}

        {rooms.length > 0 && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-sm text-neutral-400">Ничего не найдено</span>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        )}

        <ul>
          {visible.map((room) => {
            const rect = draftRects[room.id] ?? null;
            const coordsLabel = rect
              ? `x ${rect.x} · y ${rect.y} · ${rect.width}×${rect.height} px`
              : formatRoomCoords(room);
            const selected = room.id === selectedRoomId;
            const hovered = room.id === hoveredRoomId;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  data-testid={`room-row-${room.id}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(room.id)}
                  onMouseEnter={() => onHover(room.id)}
                  onMouseLeave={() => onHover(null)}
                  className={[
                    'w-full border-b border-neutral-200 px-4 py-3 text-left transition-colors',
                    selected
                      ? 'border-l-2 border-l-primary-600 bg-primary-50'
                      : hovered
                        ? 'bg-neutral-50'
                        : 'bg-white',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-neutral-900">
                      {numbers.get(room.id) ?? 0} · {room.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-neutral-500">
                      {formatArea(room.areaM2)} м²
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {room.floorType}
                    {room.zone ? ` · ${room.zone}` : ''}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-neutral-400">{coordsLabel}</div>
                  <div className="mt-1.5">
                    <TechCardPill room={room} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-neutral-200 p-4 text-sm text-neutral-700">
        Итого: <span className="font-mono">{formatArea(totalArea)}</span> м²
      </div>
    </div>
  );
}
