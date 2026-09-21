import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Запас по времени: токен считается протухшим заранее, чтобы не ловить 401 в бою. */
const EXPIRY_SKEW_MS = 30_000;
/** Если exp в токене не разобрать — считаем его валидным столько. */
const FALLBACK_TTL_MS = 5 * 60 * 1000;

/**
 * Что core читает из ответа `GET /api/users/:id` (auth-service, `SafeUser`).
 * Извлекаются ТОЛЬКО эти три поля: `fullName`/`email`/`phone` не сохраняются
 * и не логируются (NFR-01 System Design).
 */
interface AccountFacts {
  id: string;
  role: string;
  isActive: boolean;
}

/**
 * Клиент auth-service для проверки аккаунта заказчика при записи `ownerClientId`
 * (ADR-01: существующий API под сервисной учёткой, auth-service не меняется).
 *
 * Поведение по §6 System Design — fail-closed: если факт об аккаунте получить
 * нельзя, запись НЕ выполняется (503), а не сохраняется непроверенный id.
 *
 *  | Условие                                  | Результат                              |
 *  |------------------------------------------|----------------------------------------|
 *  | SERVICE_AUTH_* не заданы                 | 503 «Служебная учётная запись не настроена» |
 *  | сеть/таймаут/5xx/ошибка логина           | 503 «Не удалось проверить аккаунт заказчика» |
 *  | GET /api/users/:id → 401/403             | сброс токена, повтор 1 раз, затем 503  |
 *  | GET /api/users/:id → 404                 | 400 «Аккаунт заказчика не найден»      |
 *  | 200, role !== 'CLIENT'                   | 400 «Аккаунт не является клиентом»     |
 *  | 200, isActive !== true                   | 400 «Аккаунт клиента деактивирован»    |
 *  | 200, CLIENT и активен                    | ok                                     |
 *
 * Токен кэшируется в памяти по `exp` JWT, сбрасывается при 401, а параллельные
 * вызовы дедуплицируются (`inFlight`) — иначе упёрлись бы в лимит логина 5/мин.
 */
@Injectable()
export class AuthServiceClient {
  private readonly logger = new Logger(AuthServiceClient.name);

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

  /**
   * Проверяет, что `id` — существующий активный аккаунт с ролью CLIENT.
   * Возвращает void при успехе, бросает 400 (данные клиента) или 503 (сбой auth).
   */
  async assertClientAccount(id: string): Promise<void> {
    const account = await this.fetchAccount(id);

    if (account.role !== 'CLIENT') {
      throw new BadRequestException('Аккаунт не является клиентом');
    }
    if (account.isActive !== true) {
      throw new BadRequestException('Аккаунт клиента деактивирован');
    }
  }

  /** Читает факты об аккаунте, при 401/403 один раз повторяет со свежим токеном. */
  private async fetchAccount(id: string): Promise<AccountFacts> {
    const first = await this.requestAccount(id, await this.getAccessToken());
    if (first.status === 401 || first.status === 403) {
      this.invalidate();
      const second = await this.requestAccount(id, await this.getAccessToken());
      return this.interpret(id, second);
    }
    return this.interpret(id, first);
  }

  /** Один GET к auth-service; сетевые сбои и 5xx превращаются в 503. */
  private async requestAccount(
    id: string,
    token: string,
  ): Promise<{ status: number; payload: unknown }> {
    const url = `${this.baseUrl}/api/users/${encodeURIComponent(id)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `auth-service недоступен при проверке аккаунта (${this.baseUrl}): ${describe(error)}`,
      );
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    if (response.status >= 500) {
      this.logger.error(`auth-service вернул ${response.status} при проверке аккаунта`);
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    const payload: unknown = await response.json().catch(() => null);
    return { status: response.status, payload };
  }

  /** Переводит HTTP-ответ auth в доменную ошибку или в факты об аккаунте. */
  private interpret(id: string, response: { status: number; payload: unknown }): AccountFacts {
    if (response.status === 404) {
      throw new BadRequestException('Аккаунт заказчика не найден');
    }
    if (response.status === 401 || response.status === 403) {
      this.logger.error(
        `auth-service отклонил служебный токен (${response.status}) — проверьте SERVICE_AUTH_*`,
      );
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }
    if (response.status < 200 || response.status >= 300) {
      this.logger.error(`auth-service вернул ${response.status} при проверке аккаунта`);
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    const facts = extractFacts(response.payload);
    if (!facts) {
      this.logger.error('auth-service вернул ответ без id/role/isActive');
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }
    // Проверяем, что вернулся именно запрошенный аккаунт.
    if (facts.id !== id) {
      this.logger.error(`auth-service вернул аккаунт ${facts.id} вместо запрошенного`);
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }
    return facts;
  }

  /** Возвращает валидный служебный access-токен (при необходимости логинится). */
  private async getAccessToken(): Promise<string> {
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

  /** Сброс кэша: вызывается после 401/403 от auth-service. */
  private invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async login(): Promise<string> {
    const email = this.config.get<string>('authService.email') ?? '';
    const password = this.config.get<string>('authService.password') ?? '';
    if (email === '' || password === '') {
      this.logger.error(
        'SERVICE_AUTH_EMAIL / SERVICE_AUTH_PASSWORD не заданы — привязка объекта недоступна',
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
        `auth-service недоступен (${this.baseUrl}): ${describe(error)}. Привязка объекта невозможна.`,
      );
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    if (!response.ok) {
      this.logger.error(`auth-service вернул ${response.status} на служебный логин`);
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    const payload: unknown = await response.json().catch(() => null);
    const accessToken = extractAccessToken(payload);
    if (!accessToken) {
      this.logger.error('auth-service вернул ответ без accessToken');
      throw new ServiceUnavailableException('Не удалось проверить аккаунт заказчика');
    }

    this.token = accessToken;
    this.expiresAt = Date.now() + ttlFrom(accessToken);
    return accessToken;
  }
}

/** Извлекает ТОЛЬКО id/role/isActive — остальные поля SafeUser отбрасываются. */
function extractFacts(payload: unknown): AccountFacts | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const source = payload as Record<string, unknown>;
  const { id, role, isActive } = source;
  if (typeof id !== 'string' || id === '' || typeof role !== 'string') {
    return null;
  }
  return { id, role, isActive: isActive === true };
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
