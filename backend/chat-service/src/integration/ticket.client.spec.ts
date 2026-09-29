import { TicketClient } from './ticket.client';
import type { ServiceTokenProvider } from './service-token.provider';
import type { ConfigService } from '@nestjs/config';

function build() {
  const config = {
    get: jest.fn((key: string) =>
      key === 'ticketService.baseUrl' ? 'http://localhost:3005' : 1_000,
    ),
  } as unknown as ConfigService;
  const tokens = {
    getToken: jest.fn(async () => 'service-token'),
    invalidate: jest.fn(),
  } as unknown as ServiceTokenProvider;
  return { client: new TicketClient(config, tokens), tokens };
}

const ticketPayload = {
  id: 't-1',
  objectId: 'o-1',
  assigneeId: 'u-oper',
  createdBy: 'u-client',
  assignments: [{ assigneeId: 'u-oper' }, { assigneeId: 'u-second' }],
};

describe('TicketClient (chat-service)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('возвращает участников заявки (исполнители + автор)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ticketPayload,
    }) as unknown as typeof fetch;

    const { client } = build();
    const participants = await client.getParticipants('t-1');

    expect(participants).toEqual({
      id: 't-1',
      objectId: 'o-1',
      assigneeId: 'u-oper',
      assigneeIds: ['u-oper', 'u-second'],
      createdBy: 'u-client',
    });
  });

  it('кэширует ответ на короткий TTL (одна заявка — один вызов)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ticketPayload,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { client } = build();
    await client.getParticipants('t-1');
    await client.getParticipants('t-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.clearCache();
    await client.getParticipants('t-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('недоступность ticket-service даёт null и не бросает ошибку', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const { client } = build();
    await expect(client.getParticipants('t-1')).resolves.toBeNull();
  });

  it('404 заявки даёт null и кэшируется', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { client } = build();
    await expect(client.getParticipants('ghost')).resolves.toBeNull();
    await expect(client.getParticipants('ghost')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 → перелогин и повтор запроса', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ticketPayload });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { client, tokens } = build();
    await expect(client.getParticipants('t-1')).resolves.toMatchObject({ id: 't-1' });
    expect(tokens.invalidate).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('без сервисного токена запрос не выполняется', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const config = {
      get: jest.fn(() => 'http://localhost:3005'),
    } as unknown as ConfigService;
    const client = new TicketClient(config, {
      getToken: jest.fn(async () => null),
    } as unknown as ServiceTokenProvider);

    await expect(client.getParticipants('t-1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('устойчив к неполному ответу заявки', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 't-9' }),
    }) as unknown as typeof fetch;

    const { client } = build();
    await expect(client.getParticipants('t-9')).resolves.toEqual({
      id: 't-9',
      objectId: null,
      assigneeId: null,
      assigneeIds: [],
      createdBy: null,
    });
  });
});
