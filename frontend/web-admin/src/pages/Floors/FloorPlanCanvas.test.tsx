import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomWithTechCard } from '../../types/core';
import { FloorPlanCanvas } from './FloorPlanCanvas';

const room = (id: string, name: string, coords: boolean) =>
  ({
    id,
    name,
    zone: 'Сектор 1',
    floorType: 'Офис',
    areaM2: 10,
    techCard: null,
    createdAt: `2026-11-01T00:00:0${id}`,
    coordsX: coords ? 10 : null,
    coordsY: coords ? 10 : null,
    coordsWidth: coords ? 50 : null,
    coordsHeight: coords ? 50 : null,
  }) as unknown as RoomWithTechCard;

const rooms = [room('1', '426 Усов', true), room('2', '427 Дукаревич', true), room('3', 'ПУИ', false)];

function renderCanvas(highlighted: ReadonlySet<string> | null, selectedRoomId: string | null = null) {
  render(
    <FloorPlanCanvas
      planImageUrl="/plan.png"
      isPdf={false}
      rooms={rooms}
      highlightedRoomIds={highlighted}
      selectedRoomId={selectedRoomId}
      hoveredRoomId={null}
      canEdit={false}
      drawEnabled
      addMode={false}
      zoom={1}
      fitNonce={0}
      draftRects={{}}
      fileError={null}
      uploading={false}
      onFileError={vi.fn()}
      onZoomChange={vi.fn()}
      onPlanSizeChange={vi.fn()}
      onSelect={vi.fn()}
      onHover={vi.fn()}
      onCreateRect={vi.fn()}
      onRectChange={vi.fn()}
      onUploadFile={vi.fn()}
    />,
  );
}

const frame = (name: string) => screen.getByTitle(new RegExp(`^${name} `));

describe('FloorPlanCanvas: подсветка по фильтру', () => {
  it('без фильтра ничего не подсвечено и не бледнеет', () => {
    renderCanvas(null);
    expect(frame('426 Усов')).not.toHaveAttribute('data-highlighted');
    expect(frame('427 Дукаревич')).not.toHaveAttribute('data-dimmed');
    expect(screen.queryByTestId('plan-highlight-count')).toBeNull();
  });

  it('найденное подсвечено, остальное бледнеет', () => {
    renderCanvas(new Set(['1']));
    expect(frame('426 Усов')).toHaveAttribute('data-highlighted', 'true');
    expect(frame('426 Усов')).toHaveClass('border-2');
    expect(frame('427 Дукаревич')).toHaveAttribute('data-dimmed', 'true');
    expect(frame('427 Дукаревич')).toHaveClass('opacity-20');
    expect(screen.getByTestId('plan-highlight-count')).toHaveTextContent(
      'Подсвечено на плане: 1 из 1',
    );
  });

  it('помещение без координат считается, но на плане его нет', () => {
    renderCanvas(new Set(['1', '3']));
    expect(screen.getByTestId('plan-highlight-count')).toHaveTextContent(
      'Подсвечено на плане: 1 из 2, у остальных нет координат',
    );
  });

  it('выбранное помещение не бледнеет, даже если не найдено фильтром', () => {
    renderCanvas(new Set(['1']), '2');
    expect(frame('427 Дукаревич')).not.toHaveAttribute('data-dimmed');
  });
});
