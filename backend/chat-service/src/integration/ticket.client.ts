import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/** Минимальный срез заявки, нужный чату: кто исполнитель и кто автор. */
export interface TicketParticipants {
  id: string;
  objectId: string | null;
  assigneeId: string | null;
  /** Все, кому заявку когда-либо назначали (история назначений). */
  assigneeIds: string[];
  createdBy: string | null;
}

/**
 * HTTP-клиент ticket-service (М5.1): участники TICKET-чата и проверка
 * «пользователь причастен к заявке».
 *
 * Решение: заявка нужна и при создании чата, и при каждой проверке доступа,
 * поэтому клиент кэширует ответ на короткий TTL (в пределах запроса список
 * участников запрашивается один раз). Ошибки не бросаются: null означает
 * «ticket-service недоступен/заявки нет», вызывающий код решает, что делать.
 */
@Injectable()
export class TicketClient {
  private readonly logger = new Logger(TicketClient.name);
  /** Короткий кэш: одна и та же заявка нужна create + broadcast в одном запросе. */
  private readonly cache = new Map<string, { at: number; value: TicketParticipants | null }>();
  private readonly ttlMs = 5_000;

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

  async getParticipants(ticketId: string): Promise<TicketParticipants | null> {
    const cached = this.cache.get(ticketId);
    if (cached && Date.now() - cached.at < this.ttlMs) {
      return cached.value;
    }
    const payload = await this.getJson<Record<string, unknown>>(
      `/api/tickets/${encodeURIComponent(ticketId)}`,
    );
    const value = payload ? toTicketParticipants(payload) : null;
    // null тоже кэшируем: иначе при недоступном ticket-service каждый вызов
    // отправки сообщения будет ждать таймаут.
    this.cache.set(ticketId, { at: Date.now(), value });
    if (value === null) {
      this.logger.warn(`ticket-service: заявка ${ticketId} недоступна`);
    }
    return value;
  }

  /** Сбрасывает кэш (например, после смены исполнителя). */
  clearCache(): void {
    this.cache.clear();
  }

  /** GET с сервисным токеном: 401/403 → перелогин и один повтор. */
  private async getJson<T>(path: string): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — запрос к ticket-service пропущен');
      return null;
    }

    try {
      let response = await this.send(url, token);
      if (response.status === 401 || response.status === 403) {
        this.logger.warn(`ticket-service ответил ${response.status} — перелогин`);
        this.tokens.invalidate();
        const refreshed = await this.tokens.getToken(true);
        if (!refreshed) {
          return null;
        }
        response = await this.send(url, refreshed);
      }
      if (!response.ok) {
        this.logger.warn(`ticket-service вернул ${response.status} на ${url}`);
        return null;
      }
      return (await response.json().catch(() => null)) as T | null;
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

/** Приводит ответ ticket-service к участникам: контракт М3 известен, но поля недоверенные. */
function toTicketParticipants(ticket: Record<string, unknown>): TicketParticipants {
  const assignments = Array.isArray(ticket.assignments) ? ticket.assignments : [];
  const assigneeIds = assignments
    .map((item) =>
      typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>).assigneeId
        : undefined,
    )
    .filter((id): id is string => typeof id === 'string' && id !== '');

  const assigneeId =
    typeof ticket.assigneeId === 'string' && ticket.assigneeId !== '' ? ticket.assigneeId : null;
  if (assigneeId && !assigneeIds.includes(assigneeId)) {
    assigneeIds.push(assigneeId);
  }

  return {
    id: typeof ticket.id === 'string' ? ticket.id : '',
    objectId: typeof ticket.objectId === 'string' ? ticket.objectId : null,
    assigneeId,
    assigneeIds,
    createdBy: typeof ticket.createdBy === 'string' ? ticket.createdBy : null,
  };
}
