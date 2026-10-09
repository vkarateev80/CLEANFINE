import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/** Роли, которые получают служебные уведомления (SOS, эскалации, смена статуса заявок). */
export const STAFF_ROLES = ['ADMIN', 'SUPERVISOR'] as const;

export interface DirectoryUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

interface UsersPage {
  items: DirectoryUser[];
  total: number;
}

/** Страница справочника: auth-service отдаёт не больше 100 за запрос. */
const PAGE_SIZE = 100;

/**
 * Справочник пользователей из auth-service (09.10.2026).
 *
 * Зачем. Раньше «широковещательные» уведомления (SOS, эскалация непринятой
 * заявки, просрочка без исполнителя) уходили только владельцам активных
 * push-устройств — то есть телефонам с нативным приложением. Админ и бригадир
 * в веб-админке устройств не регистрируют и не получали ничего. Теперь
 * получатели таких событий — бригадиры и админы из справочника (плюс владельцы
 * устройств), а имя инициатора подставляется в текст.
 *
 * Отказоустойчивость: auth-service недоступен → отдаём последний удачный
 * список (пусть и устаревший); если его нет — пустой, и консьюмер падает
 * обратно на владельцев устройств.
 */
@Injectable()
export class StaffDirectoryService {
  private readonly logger = new Logger(StaffDirectoryService.name);
  private cache: DirectoryUser[] = [];
  private cachedAt = 0;
  private pending: Promise<DirectoryUser[]> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('authService.baseUrl') ?? 'http://localhost:3001';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('authService.timeoutMs') ?? 5_000;
  }

  private get cacheTtlMs(): number {
    return this.config.get<number>('authService.directoryTtlMs') ?? 60_000;
  }

  /** Все пользователи (кэш на directoryTtlMs). */
  async listUsers(): Promise<DirectoryUser[]> {
    if (Date.now() - this.cachedAt < this.cacheTtlMs) {
      return this.cache;
    }
    if (!this.pending) {
      this.pending = this.refresh().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** id активных бригадиров и админов. */
  async staffIds(): Promise<string[]> {
    const users = await this.listUsers();
    return users
      .filter((user) => user.isActive && (STAFF_ROLES as readonly string[]).includes(user.role))
      .map((user) => user.id);
  }

  /** Имя пользователя для текста уведомления; null — не нашли. */
  async userName(userId: string): Promise<string | null> {
    const users = await this.listUsers();
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return null;
    }
    return user.fullName.trim() || user.email;
  }

  private async refresh(): Promise<DirectoryUser[]> {
    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — справочник пользователей не обновлён');
      return this.cache;
    }
    try {
      const users: DirectoryUser[] = [];
      let skip = 0;
      // Пагинация на случай, если сотрудников больше одной страницы.
      for (;;) {
        const page = await this.fetchPage(token, skip);
        users.push(...page.items);
        skip += page.items.length;
        if (page.items.length === 0 || skip >= page.total) {
          break;
        }
      }
      this.cache = users;
      this.cachedAt = Date.now();
      return users;
    } catch (error) {
      this.logger.warn(
        `auth-service недоступен (${this.baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        } — используется прошлый справочник (${this.cache.length})`,
      );
      return this.cache;
    }
  }

  private async fetchPage(token: string, skip: number): Promise<UsersPage> {
    const url = `${this.baseUrl}/api/users?skip=${skip}&take=${PAGE_SIZE}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.status === 401) {
      this.tokens.invalidate();
    }
    if (!response.ok) {
      throw new Error(`auth-service ответил ${response.status} на список пользователей`);
    }
    const payload = (await response.json()) as Partial<UsersPage>;
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      items: items.map((user) => ({
        id: String(user.id),
        email: String(user.email ?? ''),
        fullName: String(user.fullName ?? ''),
        role: String(user.role ?? ''),
        isActive: user.isActive !== false,
      })),
      total: typeof payload.total === 'number' ? payload.total : items.length,
    };
  }
}
