import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushMessage, PushResult, PushSender } from './push-sender';

/**
 * Push через self-hosted ntfy (решение 05.10: свой сервер вместо Firebase).
 *
 * Контракт с устройством: токен устройства = имя топика ntfy (`cf-<hex>`,
 * генерирует клиент — 96 бит энтропии). Публикуем JSON на `${NTFY_BASE_URL}/<topic>`;
 * телефон держит подписку `GET /<topic>/json` (внешний путь https://cleanfine.ru/ntfy/…,
 * префикс срезает traefik). Внутренний адрес — Service `ntfy:8080`.
 *
 * ntfy не сообщает об убитых топиках (их и не существует — публикация всегда 200),
 * поэтому invalidTokens всегда пуст: деактивация устройств здесь не срабатывает.
 */
@Injectable()
export class NtfyPushSender implements PushSender {
  readonly name = 'ntfy';

  private readonly logger = new Logger(NtfyPushSender.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('push.ntfyUrl') ?? 'http://ntfy:8080').replace(/\/+$/, '');
  }

  async send(message: PushMessage): Promise<PushResult> {
    const results = await Promise.allSettled(
      message.tokens.map((topic) => this.publish(topic, message)),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      const reason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      this.logger.warn(
        `[NTFY PUSH] не доставлено ${failed}/${message.tokens.length} topic(s): ` +
          `${reason?.reason instanceof Error ? reason.reason.message : String(reason?.reason)}`,
      );
    } else {
      this.logger.log(
        `[NTFY PUSH] user=${message.userId} template=${message.template} ` +
          `tokens=${message.tokens.length} title="${message.title}"`,
      );
    }
    return {
      successCount: message.tokens.length - failed,
      failureCount: failed,
      invalidTokens: [],
    };
  }

  private async publish(topic: string, message: PushMessage): Promise<void> {
    // Текстовый POST + заголовок Priority: JSON-режим ntfy не работает через
    // traefik (Content-Type теряется), а кириллицу в HTTP-заголовки (Title)
    // не вставить. Весь payload — конверт в теле: {"v":1,"t":title,"b":body,"d":data}.
    // Клиент (NtfyPushService) декодирует конверт; приоритет — ASCII-заголовок.
    const envelope = JSON.stringify({
      v: 1,
      t: message.title,
      b: message.body,
      d: message.data,
    });
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Priority: message.priority === 'high' ? '5' : '3',
        Tags: 'bell',
      },
      body: envelope,
    });
    if (!response.ok) {
      throw new Error(`ntfy ${response.status}: ${await response.text().catch(() => '')}`);
    }
  }
}
