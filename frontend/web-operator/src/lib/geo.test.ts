import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHED_POSITION_MAX_AGE_MS, getCurrentPosition } from './geo';

function mockGeolocation() {
  const getPosition = vi.fn(
    (success: PositionCallback, _error?: PositionErrorCallback | null, _options?: PositionOptions) =>
      success({
        coords: { latitude: 55.7, longitude: 37.6, accuracy: 12 },
        timestamp: 1_700_000_000_000,
      } as GeolocationPosition),
  );
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: getPosition } });
  return getPosition;
}

describe('getCurrentPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fresh — без кэша: отметка прихода после «вне зоны» берёт новый замер (07.11.2026)', async () => {
    const getPosition = mockGeolocation();
    await expect(getCurrentPosition(15_000, { fresh: true })).resolves.toMatchObject({
      lat: 55.7,
      lng: 37.6,
      accuracy: 12,
    });
    expect(getPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0, timeout: 15_000 });
  });

  it('по умолчанию допускается кэш до 30 с (SOS, закрытие смены)', async () => {
    const getPosition = mockGeolocation();
    await getCurrentPosition(8000);
    expect(getPosition.mock.calls[0][2]).toMatchObject({
      maximumAge: CACHED_POSITION_MAX_AGE_MS,
      timeout: 8000,
    });
  });
});
