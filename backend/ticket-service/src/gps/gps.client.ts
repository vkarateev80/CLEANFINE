import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Оператор, найденный поблизости (М3.2, GET /api/gps/employees/nearby). */
export interface NearbyEmployee {
  userId: string;
  /** Расстояние до заявки в метрах, если gps-service его отдал. */
  distanceMeters: number | null;
}

/**
 * HTTP-клиент gps-service: поиск ближних операторов для аварийной заявки (М3.5).
 *
 * Устойчивость важнее полноты: если gps-service недоступен или ответил ошибкой,
 * клиент возвращает пустой список и пишет warning — заявка SOS всё равно создаётся.
 * Токен вызывающего пользователя пробрасывается, если он есть (gps-service сам решает,
 * нужен ли ему JWT); отсутствие токена запрос не ломает.
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

  private get defaultRadiusM(): number {
    return this.config.get<number>('gpsService.nearbyRadiusM') ?? 500;
  }

  async findNearbyEmployees(lat: number, lng: number, radiusM?: number, token?: string): Promise<NearbyEmployee[]> {
    const radius = radiusM ?? this.defaultRadiusM;
    const url = `${this.baseUrl}/api/gps/employees/nearby?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&radius=${encodeURIComponent(String(radius))}`;

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) {
        this.logger.warn(
          `gps-service вернул ${response.status} на поиск ближних операторов — список пуст`,
        );
        return [];
      }

      const payload: unknown = await response.json().catch(() => null);
      const employees = extractEmployees(payload);
      this.logger.log(`gps-service: найдено операторов поблизости — ${employees.length}`);
      return employees;
    } catch (error) {
      // Сюда попадают: gps-service не запущен, таймаут, невалидный JSON, обрыв сети.
      this.logger.warn(
        `gps-service недоступен (${this.baseUrl}): ${error instanceof Error ? error.message : String(error)}. ` +
          'Заявка создаётся без списка ближних операторов.',
      );
      return [];
    }
  }
}

/**
 * Приводит ответ gps-service к списку. Контракт М3.2 ещё не зафиксирован в коде
 * (сервис в разработке), поэтому принимаем массив или обёртку items/employees/data.
 */
function extractEmployees(payload: unknown): NearbyEmployee[] {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? firstArray(payload.items) ?? firstArray(payload.employees) ?? firstArray(payload.data)
      : null;

  if (!list) {
    return [];
  }

  return list
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const id = item.userId ?? item.employeeId ?? item.id;
      if (typeof id !== 'string' || id === '') {
        return null;
      }
      const distance = item.distanceMeters ?? item.distance ?? item.radiusMeters;
      return {
        userId: id,
        distanceMeters: typeof distance === 'number' ? distance : null,
      };
    })
    .filter((item): item is NearbyEmployee => item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
