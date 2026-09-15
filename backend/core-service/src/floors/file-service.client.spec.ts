import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileServiceClient, PlanUploadError } from './file-service.client';

/**
 * Конфиг мокается по ключу: клиент читает baseUrl и timeoutMs отдельными get(),
 * и нам важно проверить обе ветки «значение из env» и «дефолт».
 */
function makeConfig(values: Record<string, unknown> = {}) {
  return { get: jest.fn((key: string) => values[key]) };
}

function makeClient(values: Record<string, unknown> = {}) {
  return new FileServiceClient(makeConfig(values) as unknown as ConfigService);
}

function multerFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('png-bytes'),
    size: 9,
    originalname: 'plan.png',
    mimetype: 'image/png',
    ...overrides,
  } as unknown as Express.Multer.File;
}

/** Ответ fetch, каким его видит клиент. */
function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  };
}

describe('FileServiceClient', () => {
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // restoreAllMocks обязателен: тесты подменяют статический AbortSignal.timeout,
    // и утечка спая сломала бы проверку сигнала в следующем тесте.
    jest.restoreAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  describe('uploadPlan', () => {
    it('успешная загрузка: multipart в bucket plans + привязка файла к этажу', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(201, { id: 'file-1', url: 'http://minio/plans/1.png', originalName: 'plan.png' }),
        )
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const client = makeClient({ 'fileService.baseUrl': 'http://files:3002' });
      const file = multerFile();
      const result = await client.uploadPlan(file, 'token-abc', { floorId: 'floor-1', planScale: 0.05 });

      const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
      expect(uploadUrl).toBe('http://files:3002/api/files/upload');
      expect(uploadInit.method).toBe('POST');
      expect(uploadInit.headers).toEqual({ Authorization: 'Bearer token-abc' });
      expect(uploadInit.signal).toBeInstanceOf(AbortSignal);

      // Метаданные файла уходят в file-service именно так, как он их ждёт (kind=plan).
      const form = uploadInit.body as FormData;
      expect(form.get('kind')).toBe('plan');
      expect(form.get('userName')).toBe('План этажа floor-1');
      expect(form.get('file')).toBeTruthy();

      expect(result).toEqual({
        id: 'file-1',
        url: 'http://minio/plans/1.png',
        originalName: 'plan.png',
        width: null,
        height: null,
      });

      // Кросс-сервисная привязка по UUID: entityType FLOOR_PLAN + entityId этажа.
      const [attachUrl, attachInit] = fetchMock.mock.calls[1];
      expect(attachUrl).toBe('http://files:3002/api/files/file-1/attach');
      expect(attachInit.method).toBe('POST');
      expect(attachInit.headers).toEqual({
        Authorization: 'Bearer token-abc',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(attachInit.body as string)).toEqual({
        entityType: 'FLOOR_PLAN',
        entityId: 'floor-1',
      });
    });

    it('file-service вернул размеры изображения → клиент пробрасывает width/height', async () => {
      // Реальные размеры плана нужны core для валидации координат помещений (дефект B).
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(201, {
            id: 'file-1',
            url: 'http://minio/plans/1.png',
            originalName: 'plan.png',
            width: 1200,
            height: 800,
          }),
        )
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const result = await makeClient().uploadPlan(multerFile(), 'token-abc', { floorId: 'floor-1' });

      expect(result.width).toBe(1200);
      expect(result.height).toBe(800);
    });

    it('без конфига использует дефолтный адрес file-service', async () => {
      // Дефолт нужен для локального запуска без .env — регресс здесь ломает dev-стенд.
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }));

      await makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' });

      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3002/api/files/upload');
    });

    it('обрезает слэши в конце базового URL, чтобы не получить //api/files/upload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }));

      await makeClient({ 'fileService.baseUrl': 'http://files:3002///' }).uploadPlan(
        multerFile(),
        'token',
        { floorId: 'floor-1' },
      );

      expect(fetchMock.mock.calls[0][0]).toBe('http://files:3002/api/files/upload');
    });

    it('пустой baseUrl из env не ломает URL (пустая строка остаётся пустой)', async () => {
      // Пустая строка — это значение из env, дефолт подставляется только для undefined.
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }));

      await makeClient({ 'fileService.baseUrl': '' }).uploadPlan(multerFile(), 'token', {
        floorId: 'floor-1',
      });

      expect(fetchMock.mock.calls[0][0]).toBe('/api/files/upload');
    });

    it('использует настроенный timeout из конфига', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }));

      await makeClient({
        'fileService.baseUrl': 'http://files:3002',
        'fileService.timeoutMs': 2500,
      }).uploadPlan(multerFile(), 'token', { floorId: 'floor-1' });

      expect(timeoutSpy).toHaveBeenCalledWith(2500);
      timeoutSpy.mockRestore();
    });

    it('без настройки timeout берёт дефолтные 15 секунд', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }));

      await makeClient({ 'fileService.baseUrl': 'http://files:3002' }).uploadPlan(
        multerFile(),
        'token',
        { floorId: 'floor-1' },
      );

      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
      timeoutSpy.mockRestore();
    });

    it('не-2xx с текстом от file-service → PlanUploadError с этим текстом и статусом', async () => {
      fetchMock.mockResolvedValue(jsonResponse(400, { message: 'Файл слишком большой' }));

      const client = makeClient({ 'fileService.baseUrl': 'http://files:3002' });
      await expect(client.uploadPlan(multerFile(), 'token', { floorId: 'floor-1' })).rejects.toThrow(
        PlanUploadError,
      );
      await expect(client.uploadPlan(multerFile(), 'token', { floorId: 'floor-1' })).rejects.toThrow(
        'Файл слишком большой',
      );

      // Статус нужен вызывающему сервису, чтобы отличить 401 от 400.
      const error = (await client
        .uploadPlan(multerFile(), 'token', { floorId: 'floor-1' })
        .catch((e: unknown) => e)) as PlanUploadError;
      expect(error.status).toBe(400);
      expect(warnSpy).toHaveBeenCalledWith('Загрузка плана не удалась: Файл слишком большой');
    });

    it('не-2xx без message → подставляет статус ответа', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).rejects.toThrow('file-service вернул 500');
    });

    it('не-JSON тело ошибки не роняет клиент: .json() падает → берём статус', async () => {
      // file-service (или прокси перед ним) может ответить HTML-страницей ошибки.
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      });

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).rejects.toThrow('file-service вернул 502');
    });

    it('2xx без url → PlanUploadError 502 (загрузить «в пустоту» нельзя)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1' }));

      const error = (await makeClient()
        .uploadPlan(multerFile(), 'token', { floorId: 'floor-1' })
        .catch((e: unknown) => e)) as PlanUploadError;
      expect(error).toBeInstanceOf(PlanUploadError);
      expect(error.message).toBe('file-service не вернул url файла');
      expect(error.status).toBe(502);
    });

    it('пустой url → та же ошибка 502', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: '' }));

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).rejects.toThrow('file-service не вернул url файла');
    });

    it('url не строка → та же ошибка 502', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 42 }));

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).rejects.toThrow('file-service не вернул url файла');
    });

    it('нестроковый id: привязка не вызывается, id пустой, имя берётся из multer', async () => {
      // Файл уже загружен — терять его из-за кривого id в ответе нельзя.
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 123, url: 'http://minio/1.png' }));

      const result = await makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' });

      expect(result).toEqual({
        id: '',
        url: 'http://minio/1.png',
        originalName: 'plan.png',
        width: null,
        height: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('нестроковый originalName → подставляет имя загруженного файла', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png', originalName: null }),
        )
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const result = await makeClient().uploadPlan(multerFile({ originalname: 'my-plan.png' }), 'token', {
        floorId: 'floor-1',
      });

      expect(result.originalName).toBe('my-plan.png');
    });

    it('ошибка привязки (не-2xx) не отменяет успешную загрузку', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }))
        .mockResolvedValueOnce(jsonResponse(404, {}));

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).resolves.toEqual(expect.objectContaining({ url: 'http://minio/1.png' }));

      expect(warnSpy).toHaveBeenCalledWith(
        'Не удалось привязать файл file-1 к этажу floor-1: 404',
      );
    });

    it('сетевая ошибка привязки не отменяет успешную загрузку', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(201, { id: 'file-1', url: 'http://minio/1.png' }))
        .mockRejectedValueOnce(new Error('socket hang up'));

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).resolves.toEqual(expect.objectContaining({ url: 'http://minio/1.png' }));

      expect(warnSpy).toHaveBeenCalledWith('Привязка файла не удалась: socket hang up');
    });

    it('сетевая ошибка самой загрузки пробрасывается наружу', async () => {
      // Сеть упала до ответа: это не PlanUploadError, сервис обязан отдать 5xx, а не 400.
      const networkError = new Error('fetch failed');
      fetchMock.mockRejectedValueOnce(networkError);

      await expect(
        makeClient().uploadPlan(multerFile(), 'token', { floorId: 'floor-1' }),
      ).rejects.toBe(networkError);
    });
  });

  it('PlanUploadError несёт имя класса и статус', () => {
    const error = new PlanUploadError('boom', 401);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PlanUploadError');
    expect(error.message).toBe('boom');
    expect(error.status).toBe(401);
  });
});
