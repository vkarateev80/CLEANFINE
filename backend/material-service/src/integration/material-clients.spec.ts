import { ConfigService } from '@nestjs/config';
import { CoreMaterialsClient } from './core-materials.client';
import { ApiOperationMaterialsResolver } from './operation-materials.resolver';
import { ServiceTokenProvider } from './service-token.provider';
import { TicketsClient } from './tickets.client';

function createConfig(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'ticketService.baseUrl') return 'http://localhost:3005';
      if (key === 'coreService.baseUrl') return 'http://localhost:3003';
      if (key === 'ticketService.timeoutMs') return 1000;
      if (key === 'coreService.timeoutMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function createTokens(token: string | null = 'token-1'): ServiceTokenProvider {
  return {
    getToken: jest.fn().mockResolvedValue(token),
    invalidate: jest.fn(),
  } as unknown as ServiceTokenProvider;
}

/** Ответ как у fetch: json() можно вызывать один раз, поэтому клонируется тело. */
function jsonResponse(status: number, body: unknown): Response {
  const payload = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockImplementation(() => Promise.resolve(JSON.parse(payload))),
  } as unknown as Response;
}

describe('TicketsClient (цепочка М4.2, шаг 1)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('запрашивает заявку с сервисным токеном и возвращает roomId', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: 't-1', objectId: 'obj-1', roomId: 'room-1' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TicketsClient(createConfig(), createTokens());
    await expect(client.getTicket('t-1')).resolves.toEqual({
      id: 't-1',
      objectId: 'obj-1',
      roomId: 'room-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3005/api/tickets/t-1',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Bearer token-1' },
      }),
    );
  });

  it('401 → перелогин и один повтор', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { id: 't-1', objectId: 'obj-1', roomId: 'room-1' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const tokens = createTokens();
    (tokens.getToken as jest.Mock).mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    const client = new TicketsClient(createConfig(), tokens);
    await expect(client.getTicket('t-1')).resolves.toMatchObject({ roomId: 'room-1' });

    expect(tokens.invalidate).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('404/500 → null, сервис не падает', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as unknown as typeof fetch;
    const client = new TicketsClient(createConfig(), createTokens());
    await expect(client.getTicket('нет')).resolves.toBeNull();

    global.fetch = jest.fn().mockResolvedValue(jsonResponse(500, {})) as unknown as typeof fetch;
    await expect(client.getTicket('нет')).resolves.toBeNull();
  });

  it('неожиданный ответ → null; недоступный сервис → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {})) as unknown as typeof fetch;
    const client = new TicketsClient(createConfig(), createTokens());
    await expect(client.getTicket('t-1')).resolves.toBeNull();

    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(client.getTicket('t-1')).resolves.toBeNull();
  });

  it('без сервисного токена запрос не выполняется', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new TicketsClient(createConfig(), createTokens(null));

    await expect(client.getTicket('t-1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('после перелогина снова 401 → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as unknown as typeof fetch;
    const tokens = createTokens();
    (tokens.getToken as jest.Mock).mockResolvedValue('old');

    const client = new TicketsClient(createConfig(), tokens);
    await expect(client.getTicket('t-1')).resolves.toBeNull();
  });
});

describe('CoreMaterialsClient (цепочка М4.2, шаги 2–3)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('помещение без техкарты → null (списывать нечего)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { id: 'room-1', techCardId: null }),
      ) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());

    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();
  });

  it('достаёт материалы операции из техкарты', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'room-1', techCardId: 'card-1' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'card-1',
          operations: [
            {
              id: 'op-1',
              materials: [{ materialId: 'mat-1', consumptionPerOperation: 2, unit: 'л' }],
            },
            {
              id: 'op-2',
              materials: [{ materialId: 'mat-2', consumptionPerOperation: 1, unit: 'шт' }],
            },
          ],
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());

    await expect(client.getOperationMaterials('room-1', 'op-2')).resolves.toEqual([
      { materialId: 'mat-2', consumptionPerOperation: 1, unit: 'шт' },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3003/api/rooms/room-1',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3003/api/tech-cards/card-1',
      expect.anything(),
    );
  });

  it('операция без материалов → пустой массив (не null)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'room-1', techCardId: 'card-1' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: 'card-1', operations: [{ id: 'op-1' }] }),
      ) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());

    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toEqual([]);
  });

  it('операция не найдена в техкарте → null', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'room-1', techCardId: 'card-1' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: 'card-1', operations: [{ id: 'op-9' }] }),
      ) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());

    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();
  });

  it('недоступное помещение / техкарта / core → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());
    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'room-1', techCardId: 'card-1' }))
      .mockResolvedValueOnce(jsonResponse(500, {})) as unknown as typeof fetch;
    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();

    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();
  });

  it('401 → перелогин и повтор; без токена после перелогина → null', async () => {
    const tokens = createTokens();
    (tokens.getToken as jest.Mock).mockResolvedValue('token-1');
    global.fetch = jest
      .fn()
      // 1) 401 на помещение, 2) повтор с новым токеном, 3) техкарта
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'room-1', techCardId: 'card-1' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: 'card-1', operations: [{ id: 'op-1', materials: [] }] }),
      ) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), tokens);

    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toEqual([]);
    expect(tokens.invalidate).toHaveBeenCalled();

    // Перелогиниться не удалось — следующий вызов не уходит в сеть и возвращает null.
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as unknown as typeof fetch;
    (tokens.getToken as jest.Mock).mockResolvedValue(null);
    await expect(client.getOperationMaterials('room-1', 'op-1')).resolves.toBeNull();
  });

  it('название объекта для material.low и без токена', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { id: 'obj-1', name: 'БЦ «Северный»' }),
      ) as unknown as typeof fetch;
    const client = new CoreMaterialsClient(createConfig(), createTokens());
    await expect(client.getObjectName('obj-1')).resolves.toBe('БЦ «Северный»');

    const noToken = new CoreMaterialsClient(createConfig(), createTokens(null));
    await expect(noToken.getObjectName('obj-1')).resolves.toBeNull();
  });
});

describe('ApiOperationMaterialsResolver', () => {
  it('собирает цепочку ticket → room → tech-card', async () => {
    const tickets = {
      getTicket: jest.fn().mockResolvedValue({ id: 't-1', objectId: 'obj-1', roomId: 'room-1' }),
    } as unknown as TicketsClient;
    const core = {
      getOperationMaterials: jest
        .fn()
        .mockResolvedValue([{ materialId: 'mat-1', consumptionPerOperation: 0.5, unit: 'л' }]),
    } as unknown as CoreMaterialsClient;

    const resolver = new ApiOperationMaterialsResolver(createConfig(), tickets, core);
    await expect(resolver.getOperationMaterials('t-1', 'op-1')).resolves.toEqual([
      { materialId: 'mat-1', consumptionPerOperation: 0.5, unit: 'л' },
    ]);
    expect(core.getOperationMaterials).toHaveBeenCalledWith('room-1', 'op-1');
  });

  it('заявка без roomId или недоступная заявка → null', async () => {
    const tickets = {
      getTicket: jest.fn().mockResolvedValue({ id: 't-1', objectId: 'obj-1', roomId: null }),
    } as unknown as TicketsClient;
    const core = { getOperationMaterials: jest.fn() } as unknown as CoreMaterialsClient;
    const resolver = new ApiOperationMaterialsResolver(createConfig(), tickets, core);

    await expect(resolver.getOperationMaterials('t-1', 'op-1')).resolves.toBeNull();
    expect(core.getOperationMaterials).not.toHaveBeenCalled();

    (tickets.getTicket as jest.Mock).mockResolvedValue(null);
    await expect(resolver.getOperationMaterials('t-1', 'op-1')).resolves.toBeNull();
  });
});
