import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '../auth/service-token.provider';

/**
 * HTTP-клиент core-service: имя объекта для события schedule.missed_checkin
 * (контракт shared требует objectName).
 *
 * core-service закрыт JWT-гвардом, поэтому имя запрашивается служебным токеном
 * (ServiceTokenProvider): cron-проход не имеет пользовательского токена.
 * Недоступность core или auth не критична: имя объекта — украшение уведомления,
 * поэтому при любой ошибке возвращается null и вызывающий подставляет id объекта.
 */
@Injectable()
export class CoreClient {
  private readonly logger = new Logger(CoreClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return (this.config.get<string>('coreService.baseUrl') ?? 'http://localhost:3003').replace(
      /\/+$/,
      '',
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>('coreService.timeoutMs') ?? 5_000;
  }

  /** GET /api/objects/:id → name. null — объект/сервис недоступен. */
  async getObjectName(objectId: string, accessToken?: string): Promise<string | null> {
    if (!objectId) {
      return null;
    }
    const url = `${this.baseUrl}/api/objects/${encodeURIComponent(objectId)}`;
    return this.fetchName(url, accessToken, objectId);
  }

  /** GET /api/routes/:id → name. null — маршрут/сервис недоступен. */
  async getRouteName(routeId: string, accessToken?: string): Promise<string | null> {
    if (!routeId) {
      return null;
    }
    const url = `${this.baseUrl}/api/routes/${encodeURIComponent(routeId)}`;
    return this.fetchName(url, accessToken, routeId);
  }

  private async fetchName(
    url: string,
    accessToken: string | undefined,
    entityId: string,
  ): Promise<string | null> {
    let token = accessToken ?? null;
    if (!token) {
      try {
        token = await this.tokens.getAccessToken();
      } catch (error) {
        this.logger.warn(
          `Служебный токен недоступен для чтения имени ${entityId}: ${describe(error)}.`,
        );
        return null;
      }
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`core-service вернул ${response.status} на ${entityId}`);
        return null;
      }
      const payload: unknown = await response.json().catch(() => null);
      return extractName(payload);
    } catch (error) {
      this.logger.warn(
        `core-service недоступен (${this.baseUrl}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

function extractName(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const nested = record.object;
  if (typeof nested === 'object' && nested !== null) {
    const name = (nested as Record<string, unknown>).name;
    return typeof name === 'string' && name !== '' ? name : null;
  }
  const name = record.name;
  return typeof name === 'string' && name !== '' ? name : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
