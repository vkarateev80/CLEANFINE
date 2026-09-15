import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Запас по времени: токен считается протухшим заранее, чтобы не ловить 401 в бою. */
const EXPIRY_SKEW_MS = 30_000;
/** Если exp в токене не разобрать — считаем его валидным столько. */
const FALLBACK_TTL_MS = 5 * 60 * 1000;

/**
 * Служебный токен для внутренних вызовов schedule-service (cron-проходы, создание
 * заявки в ticket-service), где пользовательского токена нет вообще.
 *
 * Поведение:
 *  - токен кэшируется в памяти и переиспользуется, пока не истёк (в payload есть exp);
 *  - при 401 от вызывающего сервиса токен сбрасывается и берётся один раз заново
 *    (`invalidate` + повторный вызов `getAccessToken`), без бесконечного цикла;
 *  - недоступность auth-service → 503 с понятным текстом: это внутренняя поломка,
 *    а не ошибка клиента. HTTP-запрос вызывающего не должен падать 500-кой.
 */
@Injectable()
export class ServiceTokenProvider {
  private readonly logger = new Logger(ServiceTokenProvider.name);

  private token: string | null = null;
  private expiresAt = 0;
  /** Активный логин: параллельные вызовы не устраивают шторм логинов. */
  private inFlight: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('authService.baseUrl') ?? 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>('authService.timeoutMs') ?? 5_000;
  }

  /** Возвращает валидный служебный access-токен (при необходимости логинится). */
  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) {
      return this.token;
    }
    if (!this.inFlight) {
      this.inFlight = this.login().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /** Сброс кэша: вызывается после 401 от сервиса-получателя. */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async login(): Promise<string> {
    const email = this.config.get<string>('authService.email') ?? '';
    const password = this.config.get<string>('authService.password') ?? '';
    if (email === '' || password === '') {
      this.logger.error(
        'SERVICE_AUTH_EMAIL / SERVICE_AUTH_PASSWORD не заданы — внутренние вызовы недоступны',
      );
      throw new ServiceUnavailableException(
        'Служебная учётная запись не настроена (SERVICE_AUTH_EMAIL/SERVICE_AUTH_PASSWORD)',
      );
    }

    const url = `${this.baseUrl}/api/auth/login`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `auth-service недоступен (${this.baseUrl}): ${describe(error)}. Внутренние вызовы невозможны.`,
      );
      throw new ServiceUnavailableException('Сервис авторизации недоступен');
    }

    if (!response.ok) {
      this.logger.error(`auth-service вернул ${response.status} на служебный логин`);
      throw new ServiceUnavailableException('Не удалось получить служебный токен');
    }

    const payload: unknown = await response.json().catch(() => null);
    const accessToken = extractAccessToken(payload);
    if (!accessToken) {
      this.logger.error('auth-service вернул ответ без accessToken');
      throw new ServiceUnavailableException('Не удалось получить служебный токен');
    }

    this.token = accessToken;
    this.expiresAt = Date.now() + ttlFrom(accessToken);
    this.logger.log('Получен служебный access-токен для внутренних вызовов');
    return accessToken;
  }
}

function extractAccessToken(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const token = (payload as Record<string, unknown>).accessToken;
  return typeof token === 'string' && token !== '' ? token : null;
}

/** TTL из exp JWT; при любой проблеме с разбором — консервативный fallback. */
function ttlFrom(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return FALLBACK_TTL_MS;
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') {
      return FALLBACK_TTL_MS;
    }
    return Math.max(payload.exp * 1000 - Date.now() - EXPIRY_SKEW_MS, 1_000);
  } catch {
    return FALLBACK_TTL_MS;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
