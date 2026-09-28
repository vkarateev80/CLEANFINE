import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { authHeader, createObject, deleteObject, loginAs, runTag } from '../../helpers/core';
import { createMovement, flushPlanningData, trackMaterial, utcDate } from '../../helpers/planning';

/**
 * М7.1 — read-модели отчётов: контракты read-эндпоинтов четырёх сервисов.
 *
 * ПОЧЕМУ ЭТИХ ПРОВЕРОК НЕТ В НАБОРАХ М3/М4. Существующие наборы закрывают запись
 * (движения, смены, заявки). Здесь проверяется именно READ-слой: что read-эндпоинт
 * отвечает, что агрегат отчёта ПОБАЙТОВО сходится с фактом, созданным через публичный
 * API, и что фильтры (объект/период) действительно сужают выборку, а не игнорируются.
 *
 * ГЛАВНАЯ ПРОВЕРКА ПРИЁМКИ (п.1 плана М7.1): «отчёт по расходу соответствует движениям
 * М4». Она сделана так: тест создаёт объект и материал через API, проводит ИЗВЕСТНЫЕ
 * движения (`IN`, `OUT`, `WRITE_OFF`, `TRANSFER`) и сверяет ответ отчёта с ожидаемой
 * арифметикой, посчитанной в тесте. Ни одного значения «по виду похоже» — только точное
 * равенство, включая стоимость и число операций.
 *
 * ЕДИНАЯ ТОЧКА ВХОДА (приёмка п.3). Каждый запрос идёт через прокси-адаптер, который
 * маршрутизирует `/api/...` по девяти сервисам. Если эндпоинт отчёта не попадёт в
 * таблицу маршрутов прокси, тест покраснеет, даже когда сервис отвечает напрямую:
 * это и есть проверка «работает через единую точку входа, а не в обход».
 *
 * Адаптеров в проекте два, и оба — один и тот же приём (таблица префиксов `/api/...`):
 *  1. nginx `:8080` (прод-подобный контур, машинная обвязка стенда) — `E2E_GATEWAY_URL`;
 *  2. vite dev-сервер админки `:5173` (таблица `SERVICE_ROUTES` в `web-admin/vite.config.ts`).
 * Второй важен для CI: джоба `e2e` поднимает именно dev-серверы, nginx там нет, и без
 * адаптера проверка «через точку входа» в CI не выполнялась бы вовсе (М7.3).
 *
 * УБОРКА. Движения и материалы сносятся через `helpers/planning.ts`, объект — через API
 * core-service, заявки/уведомления — трекером «оперативки». Скрипт `tools/verify-reports.mjs`
 * в gps-service чистит геозоны своего объекта.
 */

/** Кандидаты прокси-адаптера: явный адрес → nginx стенда → vite админки (есть в CI). */
const GATEWAY_CANDIDATES = [
  process.env.E2E_GATEWAY_URL,
  'http://127.0.0.1:8080',
  'http://localhost:5173',
].filter((value): value is string => Boolean(value));

/** Живой адаптер, выбранный в `beforeAll`; до выбора пуст. */
let API_BASE = '';

/** Свой объект на прогон: отчёт фильтруется по нему, чужие данные в проверку не попадают. */
let objectId = '';

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({ request }) => {
  // Выбор адаптера — проверка ЖИВОСТИ, а не «первый из списка»: анонимный GET
  // отчёта обязан ответить 401, то есть запрос дошёл до сервиса. Статика nginx и
  // SPA-fallback dev-сервера на неизвестный /api отдают 200 с index.html, поэтому
  // 401 отличает настоящий проксирующий адаптер от «страницы-заглушки».
  const probe = '/api/materials/reports/summary';
  const attempts: string[] = [];
  for (const candidate of GATEWAY_CANDIDATES) {
    try {
      const response = await request.get(`${candidate}${probe}`, { timeout: 5_000 });
      attempts.push(`${candidate} → ${response.status()}`);
      if (response.status() === 401) {
        API_BASE = candidate;
        break;
      }
    } catch (error) {
      attempts.push(
        `${candidate} → ${error instanceof Error ? error.message.split('\n')[0] : error}`,
      );
    }
  }
  if (!API_BASE) {
    throw new Error(
      'ни один прокси-адаптер не отвечает 401 на анонимный отчёт — проверять «единую точку ' +
        `входа» не на чем. Попытки: ${attempts.join('; ')}. Поднимите nginx стенда ` +
        '(bash ~/.cleaning-ops/stand.sh web-up) или vite админки (:5173) и задайте E2E_GATEWAY_URL.',
    );
  }
  console.log(`[reports] прокси-адаптер: ${API_BASE}`);

  // Объект создаётся один раз на файл: отчёты читают данные, а не меняют их, и
  // пересоздавать объект на каждый тест значило бы платить за это временем прогона.
  const object = await createObject(request, {
    name: `E2E-M71 отчёты ${runTag()}`,
    address: 'Москва, ул. Отчётная, 1',
  });
  objectId = object.id;
});

test.afterAll(async ({ request }) => {
  // Материалы прогона создаются ТОЛЬКО через `trackMaterial` (он кладёт id в трекер М4),
  // движения уходят каскадом по materialId — иначе каждый прогон оставлял бы на стенде
  // по 4-5 материалов и десяток движений (наблюдалось в М7.3). Объект — через API
  // core-service (каскадом этажи/помещения).
  flushPlanningData();
  if (objectId) {
    await deleteObject(request, objectId);
  }
});

/** Запрос к read-эндпоинту отчёта через единую точку входа. */
async function reportApi(
  request: APIRequestContext,
  path: string,
  query: Record<string, string> = {},
): Promise<APIResponse> {
  const token = await loginAs(request, 'ADMIN');
  const search = new URLSearchParams(query).toString();
  return request.get(`${API_BASE}${path}${search ? `?${search}` : ''}`, {
    headers: authHeader(token),
  });
}

test.describe('Отчёты: расход материалов (material-service)', () => {
  test('отчёт по расходу соответствует движениям М4: количество, операции и стоимость', async ({
    request,
  }) => {
    // Три материала с разной ценой — так проверяется ещё и арифметика стоимости.
    const soap = await trackMaterial(request, {
      name: `E2E-M71 мыло ${runTag()}`,
      unit: 'л',
      costPerUnit: 100,
      defaultConsumption: 0.05,
      minStockThreshold: 2,
    });
    const rags = await trackMaterial(request, {
      name: `E2E-M71 тряпки ${runTag()}`,
      unit: 'шт',
      costPerUnit: 50,
      defaultConsumption: 1,
      minStockThreshold: 5,
    });
    const spare = await trackMaterial(request, {
      name: `E2E-M71 резерв ${runTag()}`,
      unit: 'л',
      costPerUnit: 7,
      defaultConsumption: 0.1,
      minStockThreshold: 1,
    });

    // Приход: 10 л мыла и 20 шт тряпок (в отчёт по расходу приход НЕ попадает).
    await createMovement(request, {
      materialId: soap.id,
      objectId,
      type: 'IN',
      quantity: 10,
    });
    await createMovement(request, {
      materialId: rags.id,
      objectId,
      type: 'IN',
      quantity: 20,
    });
    // Расход: 3 л мыла и 7 шт тряпок.
    await createMovement(request, { materialId: soap.id, objectId, type: 'OUT', quantity: 3 });
    await createMovement(request, { materialId: rags.id, objectId, type: 'OUT', quantity: 7 });
    // Списание: 1.5 л мыла (тоже расход).
    await createMovement(request, {
      materialId: soap.id,
      objectId,
      type: 'WRITE_OFF',
      quantity: 1.5,
    });
    // Третий материал остаётся только с приходом: в отчёте его быть не должно.
    await createMovement(request, {
      materialId: spare.id,
      objectId,
      type: 'IN',
      quantity: 4,
    });

    const today = utcDate(0);
    const response = await reportApi(request, '/api/materials/reports/consumption', {
      objectId,
      from: today,
      to: today,
    });
    expect(response.status(), await response.text()).toBe(200);
    const report = (await response.json()) as {
      rows: Array<{
        objectId: string;
        materialId: string;
        name: string;
        unit: string;
        costPerUnit: number;
        consumedQuantity: number;
        operationsCount: number;
        cost: number;
      }>;
      totals: { consumedQuantity: number; operationsCount: number; cost: number };
      series: Array<{
        day: string;
        consumedQuantity: number;
        cost: number;
        operationsCount: number;
      }>;
    };

    // Ровно две строки: материал с одним приходом в отчёт не попадает.
    expect(report.rows.map((row) => row.materialId).sort()).toEqual([soap.id, rags.id].sort());
    expect(report.rows.every((row) => row.objectId === objectId)).toBe(true);

    const soapRow = report.rows.find((row) => row.materialId === soap.id);
    const ragsRow = report.rows.find((row) => row.materialId === rags.id);

    // Ожидание посчитано в тесте из объявленных движений, а не взято из ответа.
    expect(soapRow, 'строка мыла').toMatchObject({
      name: soap.name,
      unit: 'л',
      costPerUnit: 100,
      consumedQuantity: 4.5, // 3 (OUT) + 1.5 (WRITE_OFF)
      operationsCount: 2,
      cost: 450, // 4.5 × 100
    });
    expect(ragsRow, 'строка тряпок').toMatchObject({
      name: rags.name,
      unit: 'шт',
      costPerUnit: 50,
      consumedQuantity: 7,
      operationsCount: 1,
      cost: 350, // 7 × 50
    });

    // Итоги — сумма строк, а не отдельный расчёт.
    expect(report.totals.consumedQuantity).toBeCloseTo(11.5, 5);
    expect(report.totals.operationsCount).toBe(3);
    expect(report.totals.cost).toBeCloseTo(800, 5);

    // Ряд по дням складывает материалы за день и сходится с итогами.
    const dayPoint = report.series.find((point) => point.day === today);
    expect(dayPoint, 'в ряду есть день движений').toBeDefined();
    expect(dayPoint?.consumedQuantity).toBeCloseTo(11.5, 5);
    expect(dayPoint?.cost).toBeCloseTo(800, 5);
    expect(dayPoint?.operationsCount).toBe(3);
  });

  test('фильтр периода и объекта сужает отчёт, а не игнорируется', async ({ request }) => {
    const material = await trackMaterial(request, {
      name: `E2E-M71 период ${runTag()}`,
      unit: 'л',
      costPerUnit: 10,
      defaultConsumption: 0.1,
      minStockThreshold: 0,
    });
    await createMovement(request, { materialId: material.id, objectId, type: 'IN', quantity: 5 });
    await createMovement(request, { materialId: material.id, objectId, type: 'OUT', quantity: 2 });

    const today = utcDate(0);
    const tomorrow = utcDate(1);

    // Период, в который движение не попадает: строка материала отсутствует.
    const empty = await reportApi(request, '/api/materials/reports/consumption', {
      objectId,
      from: tomorrow,
      to: tomorrow,
    });
    expect(empty.status()).toBe(200);
    const emptyReport = (await empty.json()) as {
      rows: Array<{ materialId: string }>;
      totals: { cost: number };
    };
    expect(emptyReport.rows.some((row) => row.materialId === material.id)).toBe(false);
    expect(emptyReport.totals.cost).toBe(0);

    // Чужой объект: тот же период, но объект другой — расхода нет.
    const foreign = await reportApi(request, '/api/materials/reports/consumption', {
      objectId: '00000000-0000-4000-8000-0000000000ff',
      from: today,
      to: today,
    });
    const foreignReport = (await foreign.json()) as { rows: Array<{ materialId: string }> };
    expect(foreignReport.rows.some((row) => row.materialId === material.id)).toBe(false);
  });

  test('отчёт отвечает через единую точку входа и отдаёт разрез без периода', async ({
    request,
  }) => {
    // `/api/materials/reports/consumption/by-object` — вторая таблица страницы «Отчёты».
    const byObject = await reportApi(request, '/api/materials/reports/consumption/by-object', {
      objectId,
    });
    expect(byObject.status(), await byObject.text()).toBe(200);
    const body = (await byObject.json()) as {
      rows: Array<{ objectId: string; cost: number }>;
      totals: { cost: number };
    };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.every((row) => row.objectId === objectId)).toBe(true);
  });

  test('KPI расхода материалов отдаёт числа, а не строки', async ({ request }) => {
    const response = await reportApi(request, '/api/materials/reports/summary');
    expect(response.status(), await response.text()).toBe(200);
    const summary = (await response.json()) as Record<string, unknown>;

    // BigInt из COUNT(*) ломает JSON.stringify на стороне сервиса — проверяем типы явно.
    expect(typeof summary.consumedQuantity30d).toBe('number');
    expect(typeof summary.cost30d).toBe('number');
    expect(typeof summary.operations30d).toBe('number');
    expect(typeof summary.materialsCount).toBe('number');
    expect(typeof summary.objectsCount).toBe('number');
    expect(typeof summary.lowStockCount).toBe('number');
    expect(Array.isArray(summary.topMaterials)).toBe(true);
  });

  test('экспорт CSV на странице опирается на тот же контракт: строка = объект + материал', async ({
    request,
  }) => {
    // Косвенная проверка контракта CSV: колонки файла собираются из этих полей,
    // и если поле исчезнет, экспорт покажет пустую колонку. Здесь важно, что поля
    // названы одинаково в контракте и в отчёте.
    const today = utcDate(0);
    const response = await reportApi(request, '/api/materials/reports/consumption', {
      objectId,
      from: today,
      to: today,
    });
    const report = (await response.json()) as { rows: Array<Record<string, unknown>> };
    for (const row of report.rows) {
      expect(Object.keys(row).sort()).toEqual([
        'consumedQuantity',
        'cost',
        'costPerUnit',
        'materialId',
        'name',
        'objectId',
        'operationsCount',
        'unit',
      ]);
    }
  });
});

test.describe('Отчёты: выполнение заявок (ticket-service)', () => {
  test('отчёт выполнения отвечает и согласован по итогам', async ({ request }) => {
    const response = await reportApi(request, '/api/tickets/reports/execution');
    expect(response.status(), await response.text()).toBe(200);
    const report = (await response.json()) as {
      rows: Array<{
        objectId: string;
        type: string;
        ticketsCount: number;
        completedCount: number;
        overdueCount: number;
      }>;
      series: unknown[];
      totals: {
        ticketsCount: number;
        completedCount: number;
        overdueCount: number;
        overdueRate: number;
      };
    };

    expect(Array.isArray(report.rows)).toBe(true);
    expect(Array.isArray(report.series)).toBe(true);
    // Итог — сумма строк отчёта, а не независимый запрос.
    const sum = report.rows.reduce((total, row) => total + row.ticketsCount, 0);
    expect(report.totals.ticketsCount).toBe(sum);
    expect(report.totals.overdueRate).toBeGreaterThanOrEqual(0);
    expect(report.totals.overdueRate).toBeLessThanOrEqual(100);
  });

  test('KPI заявок отдаёт числа и процент в срок', async ({ request }) => {
    const response = await reportApi(request, '/api/tickets/reports/summary');
    expect(response.status(), await response.text()).toBe(200);
    const summary = (await response.json()) as Record<string, unknown>;

    expect(typeof summary.ticketsTotal).toBe('number');
    expect(typeof summary.overdueCount).toBe('number');
    expect(typeof summary.onTimeRate).toBe('number');
    expect(summary.onTimeRate as number).toBeGreaterThanOrEqual(0);
    expect(summary.onTimeRate as number).toBeLessThanOrEqual(100);
    // Время цикла либо измерено (число), либо не измерено (null) — но не строка.
    expect(['number', 'object']).toContain(typeof summary.avgCycleMinutes);
  });
});

test.describe('Отчёты: контроль персонала (schedule-service)', () => {
  test('отчёт по сменам отвечает и сходится по итогам', async ({ request }) => {
    const response = await reportApi(request, '/api/schedule/reports/staff-control');
    expect(response.status(), await response.text()).toBe(200);
    const report = (await response.json()) as {
      rows: Array<{
        userId: string;
        shiftsCount: number;
        checkedInCount: number;
        missedCount: number;
      }>;
      byObject: unknown[];
      series: Array<{ day: string; shiftsCount: number }>;
      totals: { shiftsCount: number; checkedInCount: number; attendanceRate: number };
    };

    expect(Array.isArray(report.rows)).toBe(true);
    expect(Array.isArray(report.byObject)).toBe(true);
    // Итоги — суммы разрезов.
    expect(report.totals.shiftsCount).toBe(
      report.rows.reduce((total, row) => total + row.shiftsCount, 0),
    );
    expect(report.totals.checkedInCount).toBe(
      report.rows.reduce((total, row) => total + row.checkedInCount, 0),
    );
    expect(report.totals.attendanceRate).toBeGreaterThanOrEqual(0);
    expect(report.totals.attendanceRate).toBeLessThanOrEqual(100);
  });

  test('KPI смен отдаёт числа и null вместо деления на ноль', async ({ request }) => {
    const response = await reportApi(request, '/api/schedule/reports/summary');
    expect(response.status(), await response.text()).toBe(200);
    const summary = (await response.json()) as Record<string, unknown>;

    expect(typeof summary.shiftsTotal).toBe('number');
    expect(typeof summary.checkedInCount).toBe('number');
    expect(typeof summary.attendanceRate).toBe('number');
    // Пустой график: средняя смена не определена — null, а не 0 и не NaN.
    if ((summary.shiftsTotal as number) === 0) {
      expect(summary.avgWorkedMinutes).toBeNull();
      expect(summary.attendanceRate).toBe(100);
    }
  });
});

test.describe('Отчёты: геозоны и маршруты (gps-service)', () => {
  test('отчёт по геозонам отвечает через единую точку входа', async ({ request }) => {
    const response = await reportApi(request, '/api/gps/reports/geofence-control');
    expect(response.status(), await response.text()).toBe(200);
    const report = (await response.json()) as {
      rows: Array<{ visitsCount: number; dwellMinutes: number; presenceCount: number }>;
      routes: Array<{ pointsCount: number }>;
      series: Array<{ day: string }>;
      totals: { visitsCount: number; dwellMinutes: number; objectsVisitedCount: number };
    };

    expect(Array.isArray(report.rows)).toBe(true);
    expect(Array.isArray(report.routes)).toBe(true);

    // Порог посещения: появлений не может быть меньше, чем посещений (транзит
    // входит в появления, но не в посещения).
    for (const row of report.rows) {
      expect(row.presenceCount).toBeGreaterThanOrEqual(row.visitsCount);
      expect(row.dwellMinutes).toBeGreaterThanOrEqual(0);
    }
    expect(report.totals.visitsCount).toBe(
      report.rows.reduce((total, row) => total + row.visitsCount, 0),
    );
  });

  test('фильтр по сотруднику не расширяет выборку', async ({ request }) => {
    const unfiltered = await reportApi(request, '/api/gps/reports/geofence-control');
    const all = (await unfiltered.json()) as {
      routes: Array<{ userId: string; pointsCount: number; day: string }>;
    };

    // Фильтр по сотруднику без треков: проверяем, что он не возвращает ЧУЖИЕ строки.
    const foreign = await reportApi(request, '/api/gps/reports/geofence-control', {
      userId: '00000000-0000-4000-8000-0000000000ee',
    });
    expect(foreign.status(), await foreign.text()).toBe(200);
    const filtered = (await foreign.json()) as { rows: unknown[]; routes: unknown[] };

    expect(filtered.rows).toEqual([]);
    expect(filtered.routes).toEqual([]);
    expect(all.routes.length).toBeGreaterThanOrEqual(filtered.routes.length);
  });

  test('KPI геозон отдаёт числа и null вместо деления на ноль', async ({ request }) => {
    const response = await reportApi(request, '/api/gps/reports/summary');
    expect(response.status(), await response.text()).toBe(200);
    const summary = (await response.json()) as Record<string, unknown>;

    expect(typeof summary.visitsCount).toBe('number');
    expect(typeof summary.dwellMinutes).toBe('number');
    expect(typeof summary.pointsCount).toBe('number');
    if ((summary.visitsCount as number) === 0) {
      expect(summary.avgDwellMinutes).toBeNull();
    }
  });
});

test.describe('Отчёты: доступ', () => {
  test('без токена read-эндпоинты отчётов отвечают 401', async ({ request }) => {
    for (const path of [
      '/api/materials/reports/summary',
      '/api/tickets/reports/summary',
      '/api/schedule/reports/summary',
      '/api/gps/reports/summary',
    ]) {
      const response = await request.get(`${API_BASE}${path}`);
      expect(response.status(), `анонимный доступ к ${path}`).toBe(401);
    }
  });

  test('отчёты доступны оператору: чтение не ограничено по ролям', async ({ request }) => {
    const token = await loginAs(request, 'OPERATOR');
    for (const path of [
      '/api/materials/reports/summary',
      '/api/tickets/reports/summary',
      '/api/schedule/reports/staff-control',
      '/api/gps/reports/geofence-control',
    ]) {
      const response = await request.get(`${API_BASE}${path}`, { headers: authHeader(token) });
      expect(response.status(), `оператор и ${path}`).toBe(200);
    }
  });

  /**
   * Недоступность чужого объекта (М7.3). Скоуп объекта у отчётов задаёт параметр
   * `objectId`, а не сессия, поэтому единственная защита от утечки — точная фильтрация
   * по нему. Проверяем на несуществующем (чужом) объекте: строк быть не должно, а
   * итоги обязаны быть НУЛЕВЫМИ, а не «данными вообще по системе».
   */
  test('чужой/несуществующий objectId отдаёт пустой отчёт с нулевыми итогами', async ({
    request,
  }) => {
    const foreign = `00000000-0000-4000-8000-${runTag()
      .replace(/[^0-9a-f]/g, '')
      .slice(-12)
      .padStart(12, '0')}`;

    const consumption = await reportApi(request, '/api/materials/reports/consumption', {
      objectId: foreign,
    });
    expect(consumption.status()).toBe(200);
    const consumptionBody = (await consumption.json()) as {
      rows: unknown[];
      totals: { consumedQuantity: number; operationsCount: number; cost: number };
    };
    expect(consumptionBody.rows, 'строк по чужому объекту нет').toEqual([]);
    expect(consumptionBody.totals, 'итоги не подмешивают данные других объектов').toEqual({
      consumedQuantity: 0,
      operationsCount: 0,
      cost: 0,
    });

    const execution = await reportApi(request, '/api/tickets/reports/execution', {
      objectId: foreign,
    });
    expect(execution.status()).toBe(200);
    const executionBody = (await execution.json()) as {
      rows: unknown[];
      totals: { ticketsCount: number; completedCount: number; overdueCount: number };
    };
    expect(executionBody.rows).toEqual([]);
    expect(executionBody.totals.ticketsCount, 'чужих заявок не видно').toBe(0);
    expect(executionBody.totals.completedCount).toBe(0);
    expect(executionBody.totals.overdueCount).toBe(0);

    // Контроль контракта: по СВОЕМУ объекту отчёт отвечает той же формой (иначе
    // «пусто по чужому» могло бы объясняться сломанным эндпоинтом).
    const own = await reportApi(request, '/api/materials/reports/consumption', { objectId });
    expect(own.status()).toBe(200);
    expect((await own.json()) as unknown).toHaveProperty('totals');
  });
});
