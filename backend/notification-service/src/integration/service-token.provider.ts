import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Запас до истечения токена: считаем токен протухшим заранее. */
const EXPIRY_SKEW_MS = 30_000;

/** Сколько держать токен, если exp в JWT разобрать не удалось. */
const FALLBACK_TTL_MS = 60_000;

interface ServiceTokenResponse {
  accessToken: string;
}

/**
 * Сервисный токен notification-service для чтения справочника пользователей
 * auth-service (тот же приём, что у chat-service, М5.1): логин служебной
 * учёткой SERVICE_AUTH_EMAIL/PASSWORD, токен кэшируется до истечения.
 */
@Injectable()
export class ServiceTokenProvider {
  private readonly logger = new Logger(ServiceTokenProvider.name);
  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('authService.baseUrl') ?? 'http://localhost:3001';
  }

  private get email(): string {
    return this.config.get<string>('authService.email') ?? 'admin';
  }

  private get password(): string {
    return this.config.get<string>('authService.password') ?? 'admin123';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('authService.timeoutMs') ?? 5_000;
  }

  /** Действующий токен или null, если auth-service недоступен/отверг логин. */
  async getToken(force = false): Promise<string | null> {
    if (!force && this.token && Date.now() < this.expiresAt) {
      return this.token;
    }
    if (!this.pending) {
      this.pending = this.login().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async login(): Promise<string | null> {
    const url = `${this.baseUrl}/api/auth/login`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`auth-service вернул ${response.status} на сервисный логин`);
        this.invalidate();
        return null;
      }
      const payload = (await response.json().catch(() => null)) as ServiceTokenResponse | null;
      const token = payload?.accessToken;
      if (!token) {
        this.logger.warn('auth-service не вернул accessToken для сервисного логина');
        this.invalidate();
        return null;
      }
      this.token = token;
      this.expiresAt = Date.now() + (tokenTtlMs(token) ?? FALLBACK_TTL_MS);
      this.logger.log(`Сервисный токен получен (${this.email})`);
      return token;
    } catch (error) {
      this.logger.warn(
        `auth-service недоступен (${this.baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.invalidate();
      return null;
    }
  }
}

/** Срок жизни access-токена из JWT (exp); null — токен непрозрачный. */
export function tokenTtlMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      exp?: number;
    };
    if (typeof parsed.exp !== 'number') {
      return null;
    }
    const ttl = parsed.exp * 1000 - Date.now() - EXPIRY_SKEW_MS;
    return ttl > 0 ? ttl : 0;
  } catch {
    return null;
  }
}
