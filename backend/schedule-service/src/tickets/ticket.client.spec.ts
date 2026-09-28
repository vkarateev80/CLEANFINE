import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '../auth/service-token.provider';
import { ticketServiceUnavailable } from '../common/external-service.exception';
import { TicketClient, TicketCreationError } from './ticket.client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const INPUT = {
  type: 'planned' as const,
  priority: 'normal' as const,
  objectId: 'object-1',
  assigneeId: 'user-1',
  description: 'Плановая уборка',
};

function build() {
  const map: Record<string, unknown> = {
    'ticketService.baseUrl': 'http://localhost:3005',
    'ticketService.timeoutMs': 5_000,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  const tokens = {
    getAccessToken: jest.fn().mockResolvedValue('service-token'),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<ServiceTokenProvider>;
  return { client: new TicketClient(config, tokens), tokens };
}

describe('TicketClient', () => {
  const originalFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  it('создаёт плановую заявку служебным токеном', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { id: 'ticket-1', status: 'assigned' }),
    );

    await expect(client.createTicket(INPUT)).resolves.toEqual({ id: 'ticket-1' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3005/api/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer service-token',
      },
      body: JSON.stringify(INPUT),
      signal: expect.anything(),
    });
  });

  it('перелогинивается один раз после 401', async () => {
    const { client, tokens } = build();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'ticket-2' }));

    await expect(client.createTicket(INPUT)).resolves.toEqual({ id: 'ticket-2' });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(tokens.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('повторный 401 → ошибка без третьей попытки', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));

    await expect(client.createTicket(INPUT)).rejects.toThrow(
      'ticket-service отклонил служебный токен',
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('недоступен → retryable-ошибка (генерация продолжается)', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client.createTicket(INPUT)).rejects.toBeInstanceOf(TicketCreationError);
    await expect(client.createTicket(INPUT)).rejects.toMatchObject({ retryable: true });
  });

  it('ошибка валидации на стороне ticket-service → retryable-ошибка', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(400, { message: 'плохой объект' }));

    await expect(client.createTicket(INPUT)).rejects.toThrow('ticket-service вернул 400');
  });

  it('ответ без id → ошибка', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(201, { status: 'assigned' }));

    await expect(client.createTicket(INPUT)).rejects.toThrow('ticket-service вернул ответ без id');
  });

  it('isAvailable: true на 2xx/4xx, false на 5xx и на обрыве сети', async () => {
    const { client } = build();

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { items: [] }));
    await expect(client.isAvailable()).resolves.toBe(true);

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));
    await expect(client.isAvailable()).resolves.toBe(true);

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(503, {}));
    await expect(client.isAvailable()).resolves.toBe(false);

    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.isAvailable()).resolves.toBe(false);
  });

  it('ticketServiceUnavailable — 502 с понятным текстом', () => {
    const error = ticketServiceUnavailable();
    expect(error.getStatus()).toBe(502);
    expect(error.message).toContain('ticket-service недоступен');
  });
});
