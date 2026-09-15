import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OperationMaterials,
  RoomRef,
  TechCardRef,
} from './operation-materials';
import { ServiceTokenProvider } from './service-token.provider';

/** Ответ core-service на `GET /api/objects/:id` (для читаемого material.low). */
export interface ObjectRef {
  id: string;
  name?: string;
}

/**
 * HTTP-клиент core-service (М4.2): цепочка `GET /api/rooms/:id` → techCardId,
 * затем `GET /api/tech-cards/:id` → operations[] → materials[]. Ошибки не
 * бросаются: null означает «списать нечего/не удалось», сообщение подтверждается.
 */
@Injectable()
export class CoreMaterialsClient {
  private readonly logger = new Logger(CoreMaterialsClient.name);

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

  async getRoom(roomId: string): Promise<RoomRef | null> {
    const payload = await this.getJson<RoomRef>(`/api/rooms/${encodeURIComponent(roomId)}`);
    if (!payload) {
      this.logger.warn(`core-service: помещение ${roomId} недоступно`);
    }
    return payload;
  }

  async getTechCard(techCardId: string): Promise<TechCardRef | null> {
    const payload = await this.getJson<TechCardRef>(
      `/api/tech-cards/${encodeURIComponent(techCardId)}`,
    );
    if (!payload) {
      this.logger.warn(`core-service: техкарта ${techCardId} недоступна`);
    }
    return payload;
  }

  /** Название объекта — только для информативного payload события material.low. */
  async getObjectName(objectId: string): Promise<string | null> {
    const payload = await this.getJson<ObjectRef>(`/api/objects/${encodeURIComponent(objectId)}`);
    return payload?.name ?? null;
  }

  /**
   * Материалы операции техкарты: помещение → техкарта → операция → materials[].
   * null — цепочка оборвалась (нет roomId/techCardId, нет операции, сервис недоступен).
   */
  async getOperationMaterials(
    roomId: string,
    operationId: string,
  ): Promise<OperationMaterials> {
    const room = await this.getRoom(roomId);
    if (!room) {
      return null;
    }
    if (!room.techCardId) {
      this.logger.warn(
        `Помещение ${roomId} не привязано к техкарте — материалы операции не определить`,
      );
      return null;
    }

    const card = await this.getTechCard(room.techCardId);
    if (!card) {
      return null;
    }

    const operation = (card.operations ?? []).find((item) => item.id === operationId);
    if (!operation) {
      this.logger.warn(
        `Операция ${operationId} не найдена в техкарте ${card.id} — списание пропущено`,
      );
      return null;
    }

    return (operation.materials ?? []).map((material) => ({
      materialId: material.materialId,
      consumptionPerOperation: material.consumptionPerOperation,
      unit: material.unit,
    }));
  }

  /** GET с сервисным токеном: 401 → перелогин и один повтор. */
  private async getJson<T>(path: string): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — запрос к core-service пропущен');
      return null;
    }

    try {
      let response = await this.send(url, token);
      if (response.status === 401 || response.status === 403) {
        this.logger.warn(`core-service ответил ${response.status} — перелогин`);
        this.tokens.invalidate();
        const refreshed = await this.tokens.getToken(true);
        if (!refreshed) {
          return null;
        }
        response = await this.send(url, refreshed);
      }
      if (!response.ok) {
        this.logger.warn(`core-service вернул ${response.status} на ${url}`);
        return null;
      }
      return (await response.json().catch(() => null)) as T | null;
    } catch (error) {
      this.logger.warn(
        `core-service недоступен (${this.baseUrl}): ${
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
