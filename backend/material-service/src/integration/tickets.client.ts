import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/** Заявка ticket-service: material-service нужен только roomId. */
export interface TicketRef {
  id: string;
  objectId: string;
  roomId?: string | null;
}

/**
 * HTTP-клиент ticket-service (М4.2): `GET /api/tickets/:id` → roomId заявки.
 * Первый шаг цепочки получения материалов операции. Ошибки не бросаются:
 * возвращается null, консьюмер подтверждает сообщение без списания.
 */
@Injectable()
export class TicketsClient {
  private readonly logger = new Logger(TicketsClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('ticketService.baseUrl') ?? 'http://localhost:3005';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('ticketService.timeoutMs') ?? 5_000;
  }

  async getTicket(ticketId: string): Promise<TicketRef | null> {
    const url = `${this.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}`;
    const response = await this.authorizedGet(url);
    if (!response) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as TicketRef | null;
    if (!payload?.id && !payload?.objectId) {
      this.logger.warn(`ticket-service вернул неожиданный ответ по заявке ${ticketId}`);
      return null;
    }
    return payload;
  }

  /**
   * GET с сервисным токеном. При 401 — сброс кэша токена и один повтор,
   * при 404/5xx/таймауте — warning и null.
   */
  private async authorizedGet(url: string): Promise<Response | null> {
    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — запрос к ticket-service пропущен');
      return null;
    }
    try {
      const response = await this.send(url, token);
      if (response.status === 401 || response.status === 403) {
        this.logger.warn(`ticket-service ответил ${response.status} — перелогин`);
        this.tokens.invalidate();
        const refreshed = await this.tokens.getToken(true);
        if (!refreshed) {
          return null;
        }
        const retry = await this.send(url, refreshed);
        if (!retry.ok) {
          this.logger.warn(`ticket-service вернул ${retry.status} после перелогина`);
          return null;
        }
        return retry;
      }
      if (!response.ok) {
        this.logger.warn(`ticket-service вернул ${response.status} на ${url}`);
        return null;
      }
      return response;
    } catch (error) {
      this.logger.warn(
        `ticket-service недоступен (${this.baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private send(url: string, token: string): Promise<Response> {
    return fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
