import { describe, expect, it } from 'vitest';
import { pickCurrentEvent, shiftActionError, sortEvents, todayShifts } from './useToday';
import { previousDay, scheduleToday } from '../../lib/date';
import { LocationUnavailable } from '../../lib/geo';
import type { ScheduleEvent } from '../../types/schedule';

function event(id: string, status: ScheduleEvent['status'], plannedStart: string): ScheduleEvent {
  return {
    id,
    scheduleId: `s-${id}`,
    scheduleName: id,
    objectId: null,
    routeId: null,
    objectName: null,
    routeName: null,
    date: '2026-10-09',
    plannedStart,
    plannedEnd: plannedStart,
    status,
    userId: 'u1',
    checkInAt: null,
    checkOutAt: null,
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    ticketId: null,
    checkOutReason: null,
  };
}

describe('pickCurrentEvent (home_today.md §3.3)', () => {
  it('открытая смена важнее ближайшей', () => {
    const events = sortEvents([
      event('late', 'CHECKED_IN', '2026-10-09T18:00:00Z'),
      event('early', 'PLANNED', '2026-10-09T08:00:00Z'),
    ]);
    expect(events[0].id).toBe('early');
    expect(pickCurrentEvent(events)?.id).toBe('late');
  });

  it('без открытой — первая по времени; пустой список — null', () => {
    expect(
      pickCurrentEvent(
        sortEvents([
          event('b', 'PLANNED', '2026-10-09T12:00:00Z'),
          event('a', 'PLANNED', '2026-10-09T08:00:00Z'),
        ]),
      )?.id,
    ).toBe('a');
    expect(pickCurrentEvent([])).toBeNull();
  });
});

describe('shiftActionError (home_today.md §4)', () => {
  const http = (status: number, message?: string) => ({ response: { status, data: { message } } });
  it('коды сервера → тексты спецификации', () => {
    expect(shiftActionError(http(403, 'Вы находитесь вне зоны объекта'))).toBe(
      'Вы находитесь вне зоны объекта',
    );
    expect(shiftActionError(http(404))).toBe('Смена на сегодня не найдена');
    expect(shiftActionError(http(502))).toBe('Сервис геозон недоступен');
    expect(shiftActionError(http(400, 'Смена не открыта: сначала выполните check-in'))).toBe(
      'Смена не открыта: сначала выполните check-in',
    );
  });
  it('геолокация и сеть', () => {
    expect(shiftActionError(new LocationUnavailable('Не удалось определить местоположение'))).toBe(
      'Не удалось определить местоположение',
    );
    expect(shiftActionError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(
      'Нет соединения. Проверьте интернет',
    );
  });
});

describe('день смены по Москве (18.10.2026)', () => {
  it('после 21:00 UTC в Москве уже следующий день', () => {
    expect(scheduleToday(new Date('2026-10-18T20:59:00Z'))).toBe('2026-10-18');
    expect(scheduleToday(new Date('2026-10-18T21:00:00Z'))).toBe('2026-10-19');
  });

  it('previousDay переходит через границу месяца', () => {
    expect(previousDay('2026-11-01')).toBe('2026-10-31');
  });

  it('«Сегодня»: смены дня плюс открытая смена прошлого дня', () => {
    const today = { ...event('today', 'PLANNED', '2026-10-09T05:00:00Z'), date: '2026-10-09' };
    const openYesterday = {
      ...event('night', 'CHECKED_IN', '2026-10-08T19:00:00Z'),
      date: '2026-10-08',
    };
    const closedYesterday = {
      ...event('done', 'CHECKED_OUT', '2026-10-08T05:00:00Z'),
      date: '2026-10-08',
    };
    const shown = todayShifts([today, closedYesterday, openYesterday], '2026-10-09');
    expect(shown.map((item) => item.id)).toEqual(['night', 'today']);
    expect(pickCurrentEvent(shown)?.id).toBe('night');
  });
});
