/**
 * Разбор TTL из формата jsonwebtoken ("15m", "30d", "3600") в миллисекунды.
 * Нужен, чтобы срок жизни refresh-токена в БД совпадал со сроком в JWT.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

const TTL_PATTERN = /^(\d+)\s*(ms|s|m|h|d|w|y)?$/;

/** Без суффикса jsonwebtoken трактует число как секунды. */
export function parseTtlToMs(value: string | number | undefined, fallbackMs: number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : fallbackMs;
  }
  if (!value) {
    return fallbackMs;
  }
  const match = TTL_PATTERN.exec(String(value).trim());
  if (!match) {
    return fallbackMs;
  }
  const amount = Number(match[1]);
  if (amount <= 0) {
    return fallbackMs;
  }
  const unit = match[2] ?? 's';
  return amount * UNIT_MS[unit];
}
