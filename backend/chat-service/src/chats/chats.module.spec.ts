import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ChatsModule } from './chats.module';
import { ChatsService } from './chats.service';
import { ChatGateway } from './chat.gateway';
import { CHAT_PUSH_NOTIFIER } from '../integration/notification-push.client';
import { CoreClient } from '../integration/core.client';
import { TicketClient } from '../integration/ticket.client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Проверяем настройку модуля, а не поведение домена: JwtModule обязан получить
 * ОБЩИЙ секрет (jwt.accessSecret), иначе verifyAsync в handshake не сможет
 * проверить токен auth-service и WebSocket-соединения будут отклоняться.
 */
describe('ChatsModule', () => {
  it('регистрирует JwtService с общим секретом из конфигурации', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ChatsModule],
    })
      .useMocker((token) => {
        if (token === ConfigService) {
          return { get: jest.fn(() => 'shared-secret') };
        }
        if (token === PrismaService || token === TicketClient || token === CoreClient) {
          return {};
        }
        if (token === CHAT_PUSH_NOTIFIER) {
          return { notifyOffline: jest.fn() };
        }
        return undefined;
      })
      .compile();

    const jwt = moduleRef.get(JwtService);
    // Токен, подписанный тем же секретом, проверяется успешно — значит секрет
    // действительно доехал до JwtService.
    const token = jwt.sign({ sub: 'u-1', role: 'ADMIN' });
    await expect(jwt.verifyAsync(token, { secret: 'shared-secret' })).resolves.toMatchObject({
      sub: 'u-1',
    });
    // Другим секретом токен не проверяется.
    await expect(jwt.verifyAsync(token, { secret: 'other' })).rejects.toBeDefined();

    expect(moduleRef.get(ChatsService)).toBeDefined();
    expect(moduleRef.get(ChatGateway)).toBeDefined();
    await moduleRef.close();
  });
});
