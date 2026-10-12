import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import type { PushMessage, PushResult } from './push-sender';

/**
 * Web Push (VAPID) для PWA — рабочее место оператора cleanfine.ru/app и
 * админка (09.10.2026, «веб для всех»). Токен устройства платформы `web` —
 * JSON-подписка браузера (`PushSubscription.toJSON()`): endpoint + ключи.
 *
 * Ключи VAPID — из env WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY;
 * без них отправка отключена (in-app записи работают как прежде), а
 * `GET /api/notifications/web-push/public-key` отдаёт null — клиент тогда
 * не предлагает подписку.
 *
 * 404/410 от push-сервиса означают отозванную подписку — такие токены
 * возвращаются в invalidTokens, и устройство деактивируется.
 */
@Injectable()
export class WebPushSender {
  readonly name = 'web-push';

  private readonly logger = new Logger(WebPushSender.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {
    const publicKey = this.publicKey;
    const privateKey = this.config.get<string>('push.webPush.privateKey') ?? '';
    const subject = this.config.get<string>('push.webPush.subject') ?? 'mailto:admin@cleanfine.ru';
    if (publicKey && privateKey) {
      try {
        webPush.setVapidDetails(subject, publicKey, privateKey);
        this.configured = true;
      } catch (error) {
        this.logger.error(
          `Ключи VAPID не приняты: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      this.logger.warn('Web Push отключён: нет WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY');
    }
  }

  get publicKey(): string | null {
    const key = this.config.get<string>('push.webPush.publicKey') ?? '';
    return key.length > 0 ? key : null;
  }

  get enabled(): boolean {
    return this.configured;
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (!this.configured || message.tokens.length === 0) {
      return { successCount: 0, failureCount: message.tokens.length, invalidTokens: [] };
    }
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      type: message.template,
      priority: message.priority,
      data: message.data,
    });
    const invalidTokens: string[] = [];
    let failed = 0;
    await Promise.all(
      message.tokens.map(async (token) => {
        const subscription = parseSubscription(token);
        if (!subscription) {
          invalidTokens.push(token);
          failed += 1;
          return;
        }
        try {
          await webPush.sendNotification(subscription, payload, {
            TTL: 60 * 60,
            urgency: message.priority === 'high' ? 'high' : 'normal',
          });
        } catch (error) {
          failed += 1;
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            invalidTokens.push(token);
          } else {
            this.logger.warn(
              `[WEB PUSH] user=${message.userId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }),
    );
    if (failed < message.tokens.length) {
      this.logger.log(
        `[WEB PUSH] user=${message.userId} template=${message.template} ` +
          `delivered=${message.tokens.length - failed}/${message.tokens.length} title="${message.title}"`,
      );
    }
    return { successCount: message.tokens.length - failed, failureCount: failed, invalidTokens };
  }
}

/** Подписка из токена устройства; null — это не JSON-подписка браузера. */
export function parseSubscription(token: string): webPush.PushSubscription | null {
  try {
    const parsed = JSON.parse(token) as Partial<webPush.PushSubscription>;
    if (
      typeof parsed.endpoint !== 'string' ||
      !parsed.keys ||
      typeof parsed.keys.p256dh !== 'string' ||
      typeof parsed.keys.auth !== 'string'
    ) {
      return null;
    }
    return { endpoint: parsed.endpoint, keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth } };
  } catch {
    return null;
  }
}
