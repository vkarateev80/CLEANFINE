import { Injectable, Logger } from '@nestjs/common';
import {
  isWellFormedToken,
  type PushMessage,
  type PushResult,
  type PushSender,
} from './push-sender';

/**
 * Dev-реализация PushSender (ПЛАН.md, решение №3): вместо Firebase пишет
 * отправку в лог. Позволяет прогнать весь путь уведомления (консьюмер →
 * фильтр подписок → «push» → in-app) без кредов FCM.
 *
 * Реальная отправка включается подменой провайдера PUSH_SENDER на
 * FirebasePushSender — бизнес-логика сервиса при этом не меняется.
 */
@Injectable()
export class MockPushSender implements PushSender {
  readonly name = 'mock';

  /** Журнал отправок: используется тестами и dev-диагностикой. */
  readonly sent: PushMessage[] = [];

  private readonly logger = new Logger(MockPushSender.name);

  async send(message: PushMessage): Promise<PushResult> {
    this.sent.push(message);

    const invalidTokens = message.tokens.filter((token) => !isWellFormedToken(token));
    this.logger.log(
      `[MOCK PUSH] user=${message.userId} template=${message.template} ` +
        `priority=${message.priority} tokens=${message.tokens.length} title="${message.title}"`,
    );
    if (invalidTokens.length > 0) {
      this.logger.warn(`[MOCK PUSH] невалидные токены: ${invalidTokens.length}`);
    }

    return {
      successCount: message.tokens.length - invalidTokens.length,
      failureCount: invalidTokens.length,
      invalidTokens,
    };
  }
}
