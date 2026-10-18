import { describe, expect, it } from 'vitest';
import { describeRecurrence, formatScheduleDateTime, scheduleTime } from './scheduleHelpers';

describe('время расписания по Москве (18.10.2026)', () => {
  it('время смены показывается по МСК, а не в UTC', () => {
    expect(scheduleTime('2026-10-18T05:00:00.000Z')).toBe('08:00');
    expect(scheduleTime('2026-10-18T21:30:00.000Z')).toBe('00:30');
    expect(scheduleTime('мусор')).toBe('—');
  });

  it('дата и время отметки — московский день', () => {
    expect(formatScheduleDateTime('2026-10-18T21:30:00.000Z')).toBe('19.10.2026 00:30 МСК');
  });

  it('правило повторения подписано МСК', () => {
    expect(describeRecurrence({ frequency: 'daily', time: '08:00' })).toBe('Ежедневно · 08:00 МСК');
  });
});
