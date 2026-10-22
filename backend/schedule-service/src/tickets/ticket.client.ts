import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '../auth/service-token.provider';

/** Что schedule-service передаёт в ticket-service при создании плановой заявки. */
export interface CreateTicketInput {
  type: 'planned' | 'unscheduled';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  objectId: string;
  assigneeId?: string;
  description: string;
  /**
   * Окно смены (ISO 8601, 22.10.2026): ticket-service считает дедлайн выполнения
   * от конца смены, а не «15 минут после создания», и не шлёт ночной push.
   */
  plannedStart?: string;
  plannedEnd?: string;
}

/** Созданная заявка: schedule-service нужен только id. */
export interface CreatedTicket {
  id: string;
}

/** Ошибка создания заявки: недоступность ticket-service или отказ авторизации. */
export class TicketCreationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TicketCreationError';
  }
}

/**
 * HTTP-клиент ticket-service: POST /api/tickets (тип planned, М4.4).
 *
 * Токен — служебный (ServiceTokenProvider): генерация идёт из cron/manual-триггера,
 * пользовательского токена в этом сценарии нет.
 *
 * Поведение при 401: токен сбрасывается и запрос повторяется ровно один раз (перелогин).
 * Недоступность ticket-service не роняет генерацию целиком: клиент бросает
 * TicketCreationError(retryable=true), ScheduleService логирует и оставляет ticketId=null —
 * следующий проход генерации до-создаст заявку (идемпотентность по событию).
 */
@Injectable()
export class TicketClient {
  private readonly logger = new Logger(TicketClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return (this.config.get<string>('ticketService.baseUrl') ?? 'http://localhost:3005').replace(
      /\/+$/,
      '',
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>('ticketService.timeoutMs') ?? 5_000;
  }

  async createTicket(input: CreateTicketInput): Promise<CreatedTicket> {
    const first = await this.attempt(input, await this.tokens.getAccessToken());
    if (first.kind === 'unauthorized') {
      // Перелогин ровно один раз: второй 401 — уже проблема конфигурации/ролей.
      this.logger.warn('ticket-service отклонил служебный токен (401) — перелогин');
      this.tokens.invalidate();
      const second = await this.attempt(input, await this.tokens.getAccessToken());
      if (second.kind === 'ok') {
        return second.ticket;
      }
      throw new TicketCreationError(
        second.kind === 'unauthorized' ? 'ticket-service отклонил служебный токен' : second.message,
        second.kind !== 'unauthorized',
      );
    }
    if (first.kind === 'ok') {
      return first.ticket;
    }
    throw new TicketCreationError(first.message, true);
  }

  private async attempt(
    input: CreateTicketInput,
    token: string,
  ): Promise<
    | { kind: 'ok'; ticket: CreatedTicket }
    | { kind: 'unauthorized' }
    | { kind: 'failed'; message: string }
  > {
    const url = `${this.baseUrl}/api/tickets`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.warn(`ticket-service недоступен (${this.baseUrl}): ${describe(error)}`);
      return { kind: 'failed', message: 'ticket-service недоступен' };
    }

    if (response.status === 401) {
      return { kind: 'unauthorized' };
    }
    if (!response.ok) {
      this.logger.warn(`ticket-service вернул ${response.status} на создание заявки`);
      return { kind: 'failed', message: `ticket-service вернул ${response.status}` };
    }

    const payload: unknown = await response.json().catch(() => null);
    const id = extractId(payload);
    if (!id) {
      this.logger.warn('ticket-service вернул ответ без id заявки');
      return { kind: 'failed', message: 'ticket-service вернул ответ без id' };
    }
    return { kind: 'ok', ticket: { id } };
  }

  /**
   * Проверяет доступность ticket-service (health) — нужна, чтобы POST /generate мог
   * вернуть 502 до записи смен, если заявки заведомо не создадутся. Необязательный шаг:
   * если health-эндпоинта нет, генерация продолжается.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tickets?take=1`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${await this.tokens.getAccessToken()}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.status < 500;
    } catch {
      return false;
    }
  }
}

function extractId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const id = (payload as Record<string, unknown>).id;
  return typeof id === 'string' && id !== '' ? id : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
