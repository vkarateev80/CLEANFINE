import { describe, expect, it } from 'vitest';
import { COLOR_ZONE_META, roomColorZone } from '@cleaning-ops/shared/types/color-coding';
import type { RoomWithTechCard } from '../../types/core';
import {
  DEFAULT_ROOM_FILTER,
  highlightedRoomIds,
  isLiftZoneRoom,
  isRoomFilterActive,
  isSh3dFile,
  liftHatchImage,
  planFileError,
} from './floorPlanUtils';

describe('подсветка на плане по фильтру экспликации', () => {
  const room = (id: string, name: string, zone: string | null, floorType: string) =>
    ({ id, name, zone, floorType, createdAt: `2026-11-01T00:00:0${id}` }) as RoomWithTechCard;
  const rooms = [
    room('1', '426 Усов', 'Сектор 1', 'Офис'),
    room('2', 'ПУИ 4.21', 'Сектор 1', 'Комната уборочного инвентаря'),
    room('3', 'Санузел 4.22', 'Красная зона', 'Санузел'),
    room('4', 'Помещение 127', null, 'Офис'),
  ];

  it('без фильтра план обычный, сортировка фильтром не считается', () => {
    expect(highlightedRoomIds(rooms, DEFAULT_ROOM_FILTER)).toBeNull();
    const sorted = { ...DEFAULT_ROOM_FILTER, sort: 'area' as const };
    expect(isRoomFilterActive(sorted)).toBe(false);
    expect(highlightedRoomIds(rooms, sorted)).toBeNull();
    expect(highlightedRoomIds(rooms, { ...DEFAULT_ROOM_FILTER, search: '   ' })).toBeNull();
  });

  it('зона «Сектор 1» подсвечивает только свои помещения, санузел в красной зоне — нет', () => {
    const ids = highlightedRoomIds(rooms, { ...DEFAULT_ROOM_FILTER, zone: 'Сектор 1' });
    expect([...(ids ?? [])].sort()).toEqual(['1', '2']);
  });

  it('фильтры складываются, как в списке', () => {
    const ids = highlightedRoomIds(rooms, {
      ...DEFAULT_ROOM_FILTER,
      zone: 'Сектор 1',
      floorType: 'Офис',
    });
    expect([...(ids ?? [])]).toEqual(['1']);
  });

  it('ничего не нашлось — пустое множество, а не null: всё бледнеет', () => {
    const ids = highlightedRoomIds(rooms, { ...DEFAULT_ROOM_FILTER, search: 'нет такого' });
    expect(ids?.size).toBe(0);
  });
});

describe('planFileError: .sh3d', () => {
  it('принимает Sweet Home 3D (расширение важнее MIME — его у .sh3d нет)', () => {
    const file = new File(['x'], 'план этажа.sh3d', { type: '' });
    expect(planFileError(file)).toBeNull();
    expect(isSh3dFile(file)).toBe(true);
  });

  it('принимает картинки как раньше', () => {
    expect(planFileError(new File(['x'], 'plan.png', { type: 'image/png' }))).toBeNull();
    expect(isSh3dFile(new File(['x'], 'plan.png'))).toBe(false);
  });

  it('чужие форматы по-прежнему отклоняются', () => {
    expect(planFileError(new File(['x'], 'evil.exe', { type: '' }))).toMatch(/Недопустимый/);
  });

  it('лимит 10 МБ действует и для .sh3d', () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.sh3d');
    expect(planFileError(big)).toBe('Файл больше 10 МБ');
  });
});

describe('лифтовая и красная зоны на плане (31.10.2026)', () => {
  const lift = { name: 'Лифтовый холл 4.01.1', floorType: 'Лифтовый холл', zone: 'Лифтовая зона' };
  const wc = { name: 'Санузел 4.09', floorType: 'Санузел', zone: 'Красная зона' };
  const office = { name: '407 ГД', floorType: 'Офис', zone: 'Сектор 2' };

  it('лифтовый холл распознаётся по зоне или по типу, остальные — нет', () => {
    expect(isLiftZoneRoom(lift)).toBe(true);
    expect(isLiftZoneRoom({ floorType: 'Лифтовый холл', zone: null })).toBe(true);
    expect(isLiftZoneRoom({ floorType: 'Офис', zone: 'ЛИФТОВАЯ зона' })).toBe(true);
    expect(isLiftZoneRoom(wc)).toBe(false);
    expect(isLiftZoneRoom(office)).toBe(false);
    expect(isLiftZoneRoom({ floorType: null, zone: null })).toBe(false);
  });

  it('цвет инвентаря лифтового холла остаётся синим, санузла в красной зоне — красным', () => {
    expect(roomColorZone(lift)).toBe('BLUE');
    expect(roomColorZone(wc)).toBe('RED');
    expect(roomColorZone(office)).toBe('BLUE');
  });

  it('штриховка рисуется цветом зоны', () => {
    expect(liftHatchImage(COLOR_ZONE_META.BLUE.hex)).toContain(COLOR_ZONE_META.BLUE.hex);
  });
});
