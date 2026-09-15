import { REFRESH_TOKEN_TTL_MS } from '../tokens/tokens.service';
import { parseTtlToMs } from './ttl';

describe('parseTtlToMs', () => {
  const DAY = 86_400_000;

  it.each([
    ['15m', 900_000],
    ['30d', 30 * DAY],
    ['12h', 43_200_000],
    ['1w', 7 * DAY],
    ['500ms', 500],
    ['90s', 90_000],
  ])('переводит %s в миллисекунды', (ttl, expected) => {
    expect(parseTtlToMs(ttl, 0)).toBe(expected);
  });

  it('без суффикса трактует число как секунды (как jsonwebtoken)', () => {
    expect(parseTtlToMs('3600', 0)).toBe(3_600_000);
  });

  it('принимает число как миллисекунды', () => {
    expect(parseTtlToMs(5_000, 0)).toBe(5_000);
  });

  it('обрезка пробелов', () => {
    expect(parseTtlToMs('  30d  ', 0)).toBe(30 * DAY);
  });

  it.each([undefined, '', 'abc', '15 минут', '-5m', '0'])('возвращает fallback для %s', (value) => {
    expect(parseTtlToMs(value as string, REFRESH_TOKEN_TTL_MS)).toBe(REFRESH_TOKEN_TTL_MS);
  });

  it('для неположительного числа возвращает fallback', () => {
    expect(parseTtlToMs(0, 999)).toBe(999);
    expect(parseTtlToMs(-1, 999)).toBe(999);
  });
});
