import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/**
 * HTTP-клиент core-service (М5.1): существование объекта для OBJECT-чата.
 *
 * В core-service нет справочника «сотрудники объекта» (проверено: objects,
 * floors, rooms, routes, tech-cards), поэтому принадлежность сотрудника объекту
 * чат проверяет по явному списку участников ChatMember, а не REST-вызовом.
 * Здесь только валидация objectId при создании чата.
 */
@Injectable()
export class CoreClient {
  private readonly logger = new Logger(CoreClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('coreService.baseUrl') ?? 'http://localhost:3003';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('coreService.timeoutMs') ?? 5_000;
  }

  /**
   * true — объект существует. null — core-service недоступен (неизвестность:
   * вызывающий код решает, блокировать ли операцию; создание чата не блокируется,
   * чтобы недоступность core не мешала коммуникации).
   */
  async objectExists(objectId: string): Promise<boolean | null> {
    const url = `${this.baseUrl}/api/objects/${encodeURIComponent(objectId)}`;
    try {
      const token = await this.tokens.getToken();
      if (!token) {
        this.logger.warn('Сервисный токен недоступен — проверка объекта пропущена');
        return null;
      }
      const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 404) {
        return false;
      }
      if (!response.ok) {
        this.logger.warn(`core-service вернул ${response.status} на ${url}`);
        return null;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `core-service недоступен (${this.baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
