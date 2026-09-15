import {
  formatDateOnly,
  isoWeekday,
  matchesRecurrence,
  normalizeRecurrence,
  parseDateOnly,
  parseTimeOfDay,
  plannedStartAt,
  todayUtc,
} from './recurrence';

describe('recurrence', () => {
  describe('parseDateOnly', () => {
    it('возвращает полночь UTC для корректной даты', () => {
      const date = parseDateOnly('2026-09-16');
      expect(date.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    });

    it('отклоняет несуществующий день месяца', () => {
      expect(() => parseDateOnly('2026-02-30')).toThrow('Некорректная дата');
    });

    it('отклоняет мусорный формат', () => {
      expect(() => parseDateOnly('16.09.2026')).toThrow('Некорректная дата');
    });
  });

  it('formatDateOnly возвращает YYYY-MM-DD', () => {
    expect(formatDateOnly(new Date('2026-01-05T23:59:59.000Z'))).toBe('2026-01-05');
  });

  it('todayUtc обнуляет время', () => {
    const now = new Date('2026-09-16T18:42:11.000Z');
    expect(todayUtc(now).toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('parseTimeOfDay считает минуты от начала суток', () => {
    expect(parseTimeOfDay('08:00')).toBe(480);
    expect(parseTimeOfDay('23:59')).toBe(1439);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('8:00')).toBeNull();
    expect(parseTimeOfDay('утро')).toBeNull();
  });

  it('plannedStartAt складывает день и время', () => {
    expect(plannedStartAt(parseDateOnly('2026-09-16'), '08:00').toISOString()).toBe(
      '2026-09-16T08:00:00.000Z',
    );
  });

  it('plannedStartAt бросает на некорректном времени', () => {
    expect(() => plannedStartAt(parseDateOnly('2026-09-16'), '88:00')).toThrow(
      'Некорректное время графика',
    );
  });

  describe('isoWeekday', () => {
    it('воскресенье — 7, понедельник — 1', () => {
      expect(isoWeekday(parseDateOnly('2026-09-20'))).toBe(7); // воскресенье
      expect(isoWeekday(parseDateOnly('2026-09-21'))).toBe(1); // понедельник
    });
  });

  describe('matchesRecurrence', () => {
    it('daily попадает на любой день', () => {
      expect(matchesRecurrence({ frequency: 'daily', time: '08:00' }, parseDateOnly('2026-09-16'))).toBe(
        true,
      );
    });

    it('weekly Пн–Пт: среда — да, воскресенье — нет', () => {
      const rule = { frequency: 'weekly' as const, days: [1, 2, 3, 4, 5], time: '08:00' };
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-16'))).toBe(true); // среда
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-20'))).toBe(false); // воскресенье
    });

    it('weekly без days не совпадает ни с чем', () => {
      expect(
        matchesRecurrence({ frequency: 'weekly', time: '08:00' }, parseDateOnly('2026-09-16')),
      ).toBe(false);
    });

    it('monthly сравнивает число месяца', () => {
      const rule = { frequency: 'monthly' as const, dayOfMonth: 16, time: '08:00' };
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-16'))).toBe(true);
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-17'))).toBe(false);
    });

    it('monthly берёт days[0], если dayOfMonth не задан', () => {
      const rule = { frequency: 'monthly' as const, days: [1], time: '08:00' };
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-01'))).toBe(true);
      expect(matchesRecurrence(rule, parseDateOnly('2026-09-02'))).toBe(false);
    });

    it('monthly без числа месяца пропускается (не превращается в daily)', () => {
      expect(
        matchesRecurrence({ frequency: 'monthly', time: '08:00' }, parseDateOnly('2026-09-16')),
      ).toBe(false);
    });

    it('некорректная частота или время → false', () => {
      const date = parseDateOnly('2026-09-16');
      expect(matchesRecurrence({ frequency: 'yearly' as never, time: '08:00' }, date)).toBe(false);
      expect(matchesRecurrence({ frequency: 'daily', time: '25:00' }, date)).toBe(false);
      expect(matchesRecurrence(undefined as never, date)).toBe(false);
    });
  });

  describe('normalizeRecurrence', () => {
    it('приводит корректное правило', () => {
      expect(
        normalizeRecurrence({ frequency: 'weekly', days: ['1', 5], time: ' 08:00 ' }),
      ).toEqual({ frequency: 'weekly', days: [1, 5], dayOfMonth: undefined, time: ' 08:00 ' });
    });

    it('возвращает null на мусоре', () => {
      expect(normalizeRecurrence(null)).toBeNull();
      expect(normalizeRecurrence([])).toBeNull();
      expect(normalizeRecurrence('daily')).toBeNull();
      expect(normalizeRecurrence({ frequency: 'daily' })).toBeNull();
      expect(normalizeRecurrence({ frequency: 'hourly', time: '08:00' })).toBeNull();
    });

    it('игнорирует нечисловые дни', () => {
      expect(normalizeRecurrence({ frequency: 'weekly', days: ['пн', '3'], time: '07:30' })).toEqual({
        frequency: 'weekly',
        days: [3],
        dayOfMonth: undefined,
        time: '07:30',
      });
    });

    it('читает dayOfMonth и отбрасывает нечисловой', () => {
      expect(normalizeRecurrence({ frequency: 'monthly', dayOfMonth: '5', time: '09:00' })?.dayOfMonth).toBe(5);
      expect(
        normalizeRecurrence({ frequency: 'monthly', dayOfMonth: 'пятое', time: '09:00' })?.dayOfMonth,
      ).toBeUndefined();
    });
  });
});
