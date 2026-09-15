import { HealthController } from './health.controller';
import type { ChatGateway } from '../chats/chat.gateway';

describe('HealthController', () => {
  it('отдаёт статус и онлайн-карту', () => {
    const gateway = {
      getOnlineSnapshot: jest.fn(() => ({ 'u-1': 2 })),
    } as unknown as ChatGateway;
    const controller = new HealthController(gateway);

    expect(controller.health()).toEqual({
      status: 'ok',
      service: 'chat-service',
      online: { 'u-1': 2 },
    });
  });
});
