import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { geofenceUnavailable } from '../common/external-service.exception';

/** Результат проверки геозоны (контракт gps-service М3.2). */
export interface GeofenceCheckResult {
  inside: boolean;
  distanceMeters: number | null;
  geofence: { id: string; objectId: string; name: string; radiusMeters: number | null } | null;
}

/**
 * HTTP-клиент gps-service: проверка вхождения сотрудника в геозону объекта при check-in.
 *
 * Отличие от GpsClient в ticket-service (там недоступность gps — не критична):
 * здесь результат критичен, поэтому исход различается явно:
 *  - сервис ответил → возвращаем разобранный результат (в т.ч. inside=false);
 *  - сервис недоступен/ответил ошибкой/отдал мусор → ExternalServiceUnavailableException (502),
 *    чтобы HTTP-запрос не падал 500-кой по необработанному исключению и клиент понимал,
 *    что геозона не подтверждена.
 */
@Injectable()
export class GpsClient {
  private readonly logger = new Logger(GpsClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('gpsService.baseUrl') ?? 'http://localhost:3004').replace(
      /\/+$/,
      '',
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>('gpsService.timeoutMs') ?? 5_000;
  }

  /**
   * GET /api/gps/geofences/:userId/check?lat=&lng=
   * Токен пользователя пробрасывается, если передан (см. AccessToken).
   */
  async checkGeofence(
    userId: string,
    lat: number,
    lng: number,
    token?: string,
  ): Promise<GeofenceCheckResult> {
    const url =
      `${this.baseUrl}/api/gps/geofences/${encodeURIComponent(userId)}/check` +
      `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: buildHeaders(token),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(`gps-service недоступен (${this.baseUrl}): ${describe(error)}`);
      throw geofenceUnavailable();
    }

    if (!response.ok) {
      this.logger.error(`gps-service вернул ${response.status} на проверку геозоны`);
      throw geofenceUnavailable();
    }

    const payload: unknown = await response.json().catch(() => null);
    const result = extractCheck(payload);
    if (!result) {
      // Ответ 200 без поля inside трактовать как «внутри зоны» нельзя: это подтверждение.
      this.logger.error('gps-service вернул ответ без поля inside — геозона не подтверждена');
      throw geofenceUnavailable();
    }
    return result;
  }
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Разбирает ответ gps-service; null — контракт нарушен. */
function extractCheck(payload: unknown): GeofenceCheckResult | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.inside !== 'boolean') {
    return null;
  }
  const distance = record.distanceMeters;
  const geofence = record.geofence;
  return {
    inside: record.inside,
    distanceMeters: typeof distance === 'number' ? distance : null,
    geofence: isGeofence(geofence)
      ? {
          id: geofence.id,
          objectId: geofence.objectId,
          name: geofence.name,
          radiusMeters: typeof geofence.radiusMeters === 'number' ? geofence.radiusMeters : null,
        }
      : null,
  };
}

function isGeofence(
  value: unknown,
): value is { id: string; objectId: string; name: string; radiusMeters?: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.objectId === 'string' &&
    typeof record.name === 'string'
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
