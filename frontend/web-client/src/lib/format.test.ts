import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './format';

describe('время портала по Москве (18.10.2026)', () => {
  it('момент ISO — московские время и дата', () => {
    expect(formatTime('2026-10-18T05:00:00.000Z')).toBe('08:00');
    expect(formatDateTime('2026-10-18T21:30:00.000Z')).toBe('19.10.2026 00:30');
  });

  it('день без времени не сдвигается', () => {
    expect(formatDate('2026-10-18')).toBe('18.10.2026');
  });
});
